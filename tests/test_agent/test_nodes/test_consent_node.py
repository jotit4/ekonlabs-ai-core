"""Tests para app/agent/nodes/consent.py (F0.3 — Ley 25.326)."""
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.consent import CONSENT_REQUEST_TEXT, consent_node

_TENANT = "tenant-uuid-consent"
_PHONE = "+5491199887766"


def _state(last_message: str = "hola", **kwargs):
    return {
        "tenant_id": _TENANT,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=last_message)],
        **kwargs,
    }


class TestConsentNodeAlreadyConsented:
    def test_returns_consent_given_true(self):
        with patch("app.agent.nodes.consent.has_active_consent", return_value=True):
            result = consent_node(_state())
        assert result == {"consent_given": True}

    def test_does_not_call_redis_when_already_consented(self):
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=True),
            patch("app.agent.nodes.consent._get_redis") as mock_redis,
        ):
            consent_node(_state())
        mock_redis.assert_not_called()


class TestConsentNodeFirstContact:
    def test_returns_consent_given_false(self):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = False
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
        ):
            result = consent_node(_state("quiero turno"))

        assert result["consent_given"] is False

    def test_adds_consent_request_message(self):
        mock_redis = MagicMock()
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
        ):
            result = consent_node(_state("quiero turno"))

        messages = result["messages"]
        assert len(messages) == 1
        assert isinstance(messages[0], AIMessage)
        assert messages[0].content == CONSENT_REQUEST_TEXT

    def test_sets_redis_pending_flag(self):
        mock_redis = MagicMock()
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
        ):
            consent_node(_state("hola"))

        mock_redis.set.assert_called_once()
        call_args = mock_redis.set.call_args
        assert "consent_pending" in call_args.args[0]
        assert _TENANT in call_args.args[0]
        assert call_args.kwargs.get("ex") == 86_400  # 24h TTL


class TestConsentNodeReplyYes:
    @pytest.mark.parametrize("reply", ["SI", "si", "sí", "Sí", "yes", "acepto", "autorizo", "ok", "dale", "claro"])
    def test_records_consent_on_valid_reply_with_pending_flag(self, reply):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = True
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
            patch("app.agent.nodes.consent.record_consent") as mock_record,
        ):
            result = consent_node(_state(reply))

        assert result["consent_given"] is True
        mock_record.assert_called_once_with(_TENANT, _PHONE)

    def test_deletes_pending_flag_after_consent(self):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = True
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
            patch("app.agent.nodes.consent.record_consent"),
        ):
            consent_node(_state("SI"))

        mock_redis.delete.assert_called_once()

    def test_does_not_record_consent_without_pending_flag(self):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = False
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
            patch("app.agent.nodes.consent.record_consent") as mock_record,
        ):
            result = consent_node(_state("SI"))

        mock_record.assert_not_called()
        assert result["consent_given"] is False

    def test_non_affirmative_reply_does_not_grant_consent(self):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = True
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", return_value=mock_redis),
            patch("app.agent.nodes.consent.record_consent") as mock_record,
        ):
            result = consent_node(_state("quizas"))

        mock_record.assert_not_called()
        assert result["consent_given"] is False


class TestConsentNodeRedisFailure:
    def test_redis_unavailable_on_set_does_not_block(self):
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", side_effect=ConnectionError("redis down")),
        ):
            result = consent_node(_state("hola"))

        assert result["consent_given"] is False
        assert "messages" in result

    def test_redis_unavailable_on_exists_still_records_consent(self):
        """If Redis is down when checking pending flag, consent is recorded anyway (patient said SI)."""
        with (
            patch("app.agent.nodes.consent.has_active_consent", return_value=False),
            patch("app.agent.nodes.consent._get_redis", side_effect=ConnectionError("redis down")),
            patch("app.agent.nodes.consent.record_consent") as mock_record,
        ):
            result = consent_node(_state("SI"))

        assert result["consent_given"] is True
        mock_record.assert_called_once_with(_TENANT, _PHONE)


class TestConsentNodeErrorFallback:
    def test_unhandled_exception_returns_fail_safe(self):
        with patch(
            "app.agent.nodes.consent.has_active_consent",
            side_effect=RuntimeError("unexpected"),
        ):
            result = consent_node(_state("hola"))

        assert result["consent_given"] is False
        messages = result["messages"]
        assert len(messages) == 1
        assert isinstance(messages[0], AIMessage)

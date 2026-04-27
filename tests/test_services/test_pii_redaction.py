"""Tests for F0.4 — PII redaction in structlog processor and Sentry scrubber."""
import pytest

from app.logging.processors import hash_pii, redact_pii_processor, _REDACTED_PREFIX


class TestHashPii:
    def test_returns_prefixed_string(self):
        result = hash_pii("5491112345678")
        assert result.startswith(_REDACTED_PREFIX)

    def test_same_value_same_hash(self):
        assert hash_pii("5491112345678") == hash_pii("5491112345678")

    def test_different_values_different_hashes(self):
        assert hash_pii("5491112345678") != hash_pii("5491112345679")

    def test_hash_length_is_fixed(self):
        # prefix (4) + 12 hex chars = 16 total
        result = hash_pii("any value")
        assert len(result) == len(_REDACTED_PREFIX) + 12


class TestRedactPiiProcessor:
    def _run(self, event_dict: dict) -> dict:
        return redact_pii_processor(None, "info", event_dict)

    def test_redacts_phone_field(self):
        result = self._run({"phone": "5491112345678", "event": "test"})
        assert result["phone"].startswith(_REDACTED_PREFIX)
        assert "5491112345678" not in result["phone"]

    def test_redacts_to_field(self):
        result = self._run({"to": "5491112345678", "event": "send"})
        assert result["to"].startswith(_REDACTED_PREFIX)

    def test_redacts_dni_field(self):
        result = self._run({"dni": "32456789", "event": "test"})
        assert result["dni"].startswith(_REDACTED_PREFIX)

    def test_redacts_full_name_field(self):
        result = self._run({"full_name": "Juan Pérez", "event": "test"})
        assert result["full_name"].startswith(_REDACTED_PREFIX)

    def test_leaves_non_pii_fields_unchanged(self):
        result = self._run({"tenant_id": "abc-123", "event": "ok", "status": "active"})
        assert result["tenant_id"] == "abc-123"
        assert result["event"] == "ok"

    def test_does_not_redact_none_value(self):
        result = self._run({"phone": None, "event": "test"})
        assert result["phone"] is None

    def test_does_not_redact_empty_string(self):
        result = self._run({"phone": "", "event": "test"})
        assert result["phone"] == ""

    def test_hash_is_deterministic_across_calls(self):
        r1 = self._run({"phone": "5491112345678", "event": "a"})
        r2 = self._run({"phone": "5491112345678", "event": "b"})
        assert r1["phone"] == r2["phone"]

    def test_event_dict_returned(self):
        d = {"phone": "123", "event": "x"}
        result = self._run(d)
        assert isinstance(result, dict)
        assert "event" in result


class TestSentryScrubber:
    def test_scrubs_pii_in_nested_dict(self):
        from app.observability.sentry import _scrub_dict
        obj = {"user": {"phone": "5491112345678", "tenant": "abc"}}
        result = _scrub_dict(obj)
        assert result["user"]["phone"].startswith(_REDACTED_PREFIX)
        assert result["user"]["tenant"] == "abc"

    def test_scrubs_pii_in_list_of_dicts(self):
        from app.observability.sentry import _scrub_dict
        obj = [{"phone": "123"}, {"tenant_id": "xyz"}]
        result = _scrub_dict(obj)
        assert result[0]["phone"].startswith(_REDACTED_PREFIX)
        assert result[1]["tenant_id"] == "xyz"

    def test_depth_guard_prevents_infinite_recursion(self):
        from app.observability.sentry import _scrub_dict
        # depth > 10 returns object unchanged (guard is depth > 10)
        obj = {"phone": "123"}
        result = _scrub_dict(obj, depth=11)
        assert result == {"phone": "123"}

    def test_before_send_returns_scrubbed_event(self):
        from app.observability.sentry import _before_send
        event = {"extra": {"phone": "5491112345678"}, "message": "test"}
        result = _before_send(event, {})
        assert result["extra"]["phone"].startswith(_REDACTED_PREFIX)
        assert result["message"] == "test"

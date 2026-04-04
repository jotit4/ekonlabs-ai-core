"""Tests for Evolution API webhook endpoint and payload normalizer."""
import json
from unittest.mock import MagicMock, patch

import pytest

TEST_EVOLUTION_APIKEY = "test_evolution_key_xyz"
TEST_EVOLUTION_DISPLAY_PHONE = "5491112345678"
TEST_TENANT_ID = "12345678-1234-5678-1234-567812345678"


def _make_evolution_payload(
    from_me=False,
    event="messages.upsert",
    remote_jid="5491199999999@s.whatsapp.net",
    msg_id="EV_MSG_001",
):
    return {
        "event": event,
        "instance": "clinic-isadi",
        "data": {
            "key": {"remoteJid": remote_jid, "fromMe": from_me, "id": msg_id},
            "pushName": "Paciente",
            "message": {"conversation": "Hola turno"},
            "messageType": "conversation",
            "messageTimestamp": 1717689097,
        },
    }


def _make_mock_tenant():
    from uuid import UUID
    mock = MagicMock()
    mock.tenant_id = UUID(TEST_TENANT_ID)
    return mock


# ─── Normalizer unit tests ───────────────────────────────────────────────────

def test_normalize_extracts_phone_from_remote_jid():
    from app.api.v1.webhooks import _normalize_evolution_payload
    from app.models.evolution_webhook import EVOLUTION_MESSAGES_UPSERT_FIXTURE

    normalized = _normalize_evolution_payload(EVOLUTION_MESSAGES_UPSERT_FIXTURE)
    phone = normalized["entry"][0]["changes"][0]["value"]["messages"][0]["from"]
    assert phone == "5491112345678"


def test_normalize_extracts_conversation_text():
    from app.api.v1.webhooks import _normalize_evolution_payload
    from app.models.evolution_webhook import EVOLUTION_MESSAGES_UPSERT_FIXTURE

    normalized = _normalize_evolution_payload(EVOLUTION_MESSAGES_UPSERT_FIXTURE)
    text = normalized["entry"][0]["changes"][0]["value"]["messages"][0]["text"]["body"]
    assert text == "Hola quiero un turno"


def test_normalize_extracts_extended_text_fallback():
    from app.api.v1.webhooks import _normalize_evolution_payload

    payload = {
        "event": "messages.upsert",
        "instance": "clinic-isadi",
        "data": {
            "key": {"remoteJid": "5491112345678@s.whatsapp.net", "fromMe": False, "id": "XYZ"},
            "message": {"extendedTextMessage": {"text": "Texto extendido"}},
            "messageTimestamp": 1717689097,
        },
    }
    normalized = _normalize_evolution_payload(payload)
    text = normalized["entry"][0]["changes"][0]["value"]["messages"][0]["text"]["body"]
    assert text == "Texto extendido"


def test_normalize_sets_provider_evolution():
    from app.api.v1.webhooks import _normalize_evolution_payload
    from app.models.evolution_webhook import EVOLUTION_MESSAGES_UPSERT_FIXTURE

    normalized = _normalize_evolution_payload(EVOLUTION_MESSAGES_UPSERT_FIXTURE)
    assert normalized["provider"] == "evolution"


def test_normalize_output_navigates_extract_message_info():
    from app.api.v1.webhooks import _normalize_evolution_payload
    from app.models.evolution_webhook import EVOLUTION_MESSAGES_UPSERT_FIXTURE
    from app.workers.tasks import _extract_message_info

    normalized = _normalize_evolution_payload(EVOLUTION_MESSAGES_UPSERT_FIXTURE)
    result = _extract_message_info(normalized)
    assert result == ("5491112345678", "Hola quiero un turno")


# ─── Endpoint integration tests ──────────────────────────────────────────────

def test_evolution_webhook_rejects_invalid_apikey(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    payload = _make_evolution_payload()
    resp = client.post(
        "/api/v1/webhooks/evolution",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json", "apikey": "wrong-key"},
    )
    assert resp.status_code == 403


def test_evolution_webhook_rejects_missing_apikey(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    payload = _make_evolution_payload()
    resp = client.post(
        "/api/v1/webhooks/evolution",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 403


def test_evolution_webhook_ignores_non_message_event(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    payload = _make_evolution_payload(event="CONNECTION_UPDATE")
    with patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue:
        resp = client.post(
            "/api/v1/webhooks/evolution",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json", "apikey": TEST_EVOLUTION_APIKEY},
        )
    assert resp.status_code == 200
    mock_enqueue.assert_not_called()


def test_evolution_webhook_ignores_from_me(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    payload = _make_evolution_payload(from_me=True)
    with patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue:
        resp = client.post(
            "/api/v1/webhooks/evolution",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json", "apikey": TEST_EVOLUTION_APIKEY},
        )
    assert resp.status_code == 200
    mock_enqueue.assert_not_called()


def test_evolution_webhook_ignores_group_jid(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    payload = _make_evolution_payload(remote_jid="120363123456789@g.us")
    with patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue:
        resp = client.post(
            "/api/v1/webhooks/evolution",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json", "apikey": TEST_EVOLUTION_APIKEY},
        )
    assert resp.status_code == 200
    mock_enqueue.assert_not_called()


def test_evolution_webhook_enqueues_valid_message(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_DISPLAY_PHONE", TEST_EVOLUTION_DISPLAY_PHONE)
    payload = _make_evolution_payload(msg_id="UNIQUE_MSG_001")

    with patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue, \
         patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=_make_mock_tenant()), \
         patch("app.api.v1.webhooks._get_redis_pool") as mock_redis:
        mock_redis.return_value.set.return_value = True
        resp = client.post(
            "/api/v1/webhooks/evolution",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json", "apikey": TEST_EVOLUTION_APIKEY},
        )

    assert resp.status_code == 200
    mock_enqueue.assert_called_once()
    enqueued_payload = mock_enqueue.call_args[0][0]
    assert enqueued_payload["provider"] == "evolution"


def test_evolution_webhook_ignores_unknown_tenant(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_API_KEY", TEST_EVOLUTION_APIKEY)
    monkeypatch.setattr("app.api.v1.webhooks.settings.EVOLUTION_DISPLAY_PHONE", TEST_EVOLUTION_DISPLAY_PHONE)
    payload = _make_evolution_payload(msg_id="UNIQUE_MSG_002")

    with patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue, \
         patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=None), \
         patch("app.api.v1.webhooks._get_redis_pool") as mock_redis:
        mock_redis.return_value.set.return_value = True
        resp = client.post(
            "/api/v1/webhooks/evolution",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json", "apikey": TEST_EVOLUTION_APIKEY},
        )

    assert resp.status_code == 200
    mock_enqueue.assert_not_called()

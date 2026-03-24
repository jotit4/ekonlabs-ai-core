"""Tests de integración para endpoints de webhook WhatsApp (Story 2.1)."""
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch
from uuid import UUID

import app.core.security as sec_module

TEST_SECRET = "test_meta_secret_xyz"
TEST_VERIFY_TOKEN = "test_verify_token_abc"
TEST_CHALLENGE = "CHALLENGE_TOKEN_12345"
TEST_TENANT_ID = "12345678-1234-5678-1234-567812345678"
TEST_PHONE = "15550051237"


def _sign_body(body: bytes, secret: str = TEST_SECRET) -> str:
    """Helper: genera firma HMAC-SHA256 válida para tests."""
    h = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
    return f"sha256={h.hexdigest()}"


def _make_webhook_payload(phone: str = TEST_PHONE) -> dict:
    """Helper: construye un payload de webhook Meta completo."""
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "ENTRY_123",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": phone,
                        "phone_number_id": "106540352242922",
                    },
                    "contacts": [{"profile": {"name": "Test User"}, "wa_id": "15551234567"}],
                    "messages": [{
                        "from": "15551234567",
                        "id": "wamid.test_message_id_123",
                        "timestamp": "1680000000",
                        "type": "text",
                        "text": {"body": "Hola, quiero info sobre ortodoncia"},
                    }],
                },
                "field": "messages",
            }],
        }],
    }


def _make_mock_tenant():
    """Helper: crea un TenantResponse mock para tests de integración."""
    from app.models.tenant import TenantResponse
    return TenantResponse(
        tenant_id=UUID(TEST_TENANT_ID),
        name="Clinica Test",
        whatsapp_number=f"+{TEST_PHONE}",
        timezone="America/Buenos_Aires",
        shadow_mode_enabled=False,
        status="active",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/whatsapp — Challenge verification
# ---------------------------------------------------------------------------


def test_webhook_get_returns_challenge(client, monkeypatch):
    """GET con parámetros correctos → 200 + body == hub.challenge."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    response = client.get(
        "/api/v1/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.challenge": TEST_CHALLENGE,
            "hub.verify_token": TEST_VERIFY_TOKEN,
        },
    )
    assert response.status_code == 200
    assert response.text == TEST_CHALLENGE


def test_webhook_get_rejects_wrong_token(client, monkeypatch):
    """GET con token incorrecto → 403 con código WEBHOOK_TOKEN_INVALID."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    response = client.get(
        "/api/v1/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.challenge": TEST_CHALLENGE,
            "hub.verify_token": "wrong_token_here",
        },
    )
    assert response.status_code == 403
    data = response.json()
    assert data["status"] == "error"
    assert data["error"]["code"] == "WEBHOOK_TOKEN_INVALID"


def test_webhook_get_rejects_empty_verify_token_setting(client, monkeypatch):
    """GET cuando META_VERIFY_TOKEN no está configurado → 403."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", "")
    response = client.get(
        "/api/v1/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.challenge": TEST_CHALLENGE,
            "hub.verify_token": "",
        },
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks/whatsapp — Message reception
# ---------------------------------------------------------------------------


def test_webhook_post_rejects_invalid_signature(client, monkeypatch):
    """POST con firma HMAC incorrecta → 403 con código WEBHOOK_SIGNATURE_INVALID."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = json.dumps(_make_webhook_payload()).encode()
    response = client.post(
        "/api/v1/webhooks/whatsapp",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=invalidsignaturehere",
        },
    )
    assert response.status_code == 403
    data = response.json()
    assert data["status"] == "error"
    assert data["error"]["code"] == "WEBHOOK_SIGNATURE_INVALID"


def test_webhook_post_rejects_missing_signature(client, monkeypatch):
    """POST sin cabecera X-Hub-Signature-256 → 403."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = json.dumps(_make_webhook_payload()).encode()
    response = client.post(
        "/api/v1/webhooks/whatsapp",
        content=body,
        headers={"Content-Type": "application/json"},
        # Sin X-Hub-Signature-256
    )
    assert response.status_code == 403
    data = response.json()
    assert data["error"]["code"] == "WEBHOOK_SIGNATURE_INVALID"


def test_webhook_post_returns_200_when_tenant_not_found(client, monkeypatch):
    """POST con firma válida pero tenant inexistente → 200 OK (Meta no reintenta en 200)."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    with patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=None):
        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"] is None
    assert "timestamp" in data["meta"]


def test_webhook_post_enqueues_and_returns_200(client, monkeypatch):
    """POST con firma válida y tenant existente → 200 OK + tarea encolada en RQ."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant) as mock_phone,
        patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue,
    ):
        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    # Verificar que get_tenant_by_phone fue llamado con el número correcto
    mock_phone.assert_called_once_with(TEST_PHONE)

    # Verificar que _enqueue_task fue llamado con el payload y tenant_id correctos
    mock_enqueue.assert_called_once()
    call_args = mock_enqueue.call_args[0]  # positional args
    enqueued_payload, enqueued_tenant_id = call_args[0], call_args[1]
    assert enqueued_tenant_id == TEST_TENANT_ID
    assert enqueued_payload["entry"][0]["changes"][0]["value"]["metadata"]["display_phone_number"] == TEST_PHONE


def test_webhook_post_returns_200_for_status_webhook(client, monkeypatch):
    """Webhook de estado Meta (sin entries/messages) → 200 OK, sin intentar resolver tenant."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    # Payload de status delivery receipt — sin entries
    status_payload = {"object": "whatsapp_business_account", "entry": []}
    body = json.dumps(status_payload).encode()
    sig = _sign_body(body)

    with patch("app.api.v1.webhooks.get_tenant_by_phone") as mock_phone:
        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_phone.assert_not_called()  # No intenta resolver tenant para webhooks de estado


def test_webhook_post_standard_response_format(client, monkeypatch):
    """Respuesta exitosa tiene el formato wrapper estándar completo."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=None),
    ):
        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )

    assert response.status_code == 200
    data = response.json()
    # Verificar formato wrapper estándar
    assert "status" in data
    assert "data" in data
    assert "error" in data
    assert "meta" in data
    assert "timestamp" in data["meta"]
    assert data["status"] == "success"
    assert data["data"] is None
    assert data["error"] is None


def test_webhook_post_returns_200_for_invalid_json_after_valid_signature(client, monkeypatch):
    """POST con firma válida pero JSON malformado → 200 OK (Meta no debe reintentar en 200)."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    # Payload con firma válida pero estructura JSON que no cumple el schema de Meta
    body = b'{"object": "unknown_type"}'
    sig = _sign_body(body)

    response = client.post(
        "/api/v1/webhooks/whatsapp",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sig,
        },
    )

    # Aunque el payload no cumple el schema, la respuesta debe ser 200 (no 400/500)
    # para evitar bucles de retry automáticos de Meta en respuestas 4xx.
    assert response.status_code == 200
    assert response.json()["status"] == "success"

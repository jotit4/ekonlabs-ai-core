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

    mock_redis = MagicMock()
    mock_redis.set.return_value = True  # SET NX succeeds — new key

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=None),
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
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
    assert data["data"] is None
    assert "timestamp" in data["meta"]


def test_webhook_post_enqueues_and_returns_200(client, monkeypatch):
    """POST con firma válida y tenant existente → 200 OK + tarea encolada en RQ."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    mock_redis = MagicMock()
    mock_redis.set.return_value = True  # SET NX succeeds — new key

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant) as mock_phone,
        patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue,
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
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

    mock_redis = MagicMock()
    mock_redis.set.return_value = True  # SET NX succeeds — new key

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=None),
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
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


# ---------------------------------------------------------------------------
# INFRA-02 / INFRA-03 / INFRA-04: Redis pool + 503 + Retry
# ---------------------------------------------------------------------------


def test_enqueue_task_raises_503_on_redis_error():
    from redis.exceptions import ConnectionError as RedisConnectionError
    from app.api.v1.webhooks import _enqueue_task
    from app.core.exceptions import AppException
    import pytest

    with (
        patch("app.api.v1.webhooks._get_redis_pool") as mock_pool,
        patch("app.api.v1.webhooks.Queue") as mock_queue_cls,
    ):
        mock_pool.return_value = MagicMock()
        mock_q = MagicMock()
        mock_queue_cls.return_value = mock_q
        mock_q.enqueue.side_effect = RedisConnectionError("Connection refused")

        with pytest.raises(AppException) as exc_info:
            _enqueue_task({"entry": []}, "tenant-abc")

    assert exc_info.value.status_code == 503
    assert exc_info.value.code == "REDIS_UNAVAILABLE"


def test_enqueue_task_503_propagates_to_endpoint(client, monkeypatch):
    import app.core.security as sec_module
    from redis.exceptions import ConnectionError as RedisConnectionError
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant),
        patch("app.api.v1.webhooks._get_redis_pool") as mock_pool,
        patch("app.api.v1.webhooks.Queue") as mock_queue_cls,
    ):
        mock_pool.return_value = MagicMock()
        mock_q = MagicMock()
        mock_queue_cls.return_value = mock_q
        mock_q.enqueue.side_effect = RedisConnectionError("down")

        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )

    assert response.status_code == 503


def test_enqueue_task_uses_retry_object():
    from app.api.v1.webhooks import _enqueue_task
    from rq import Retry

    with (
        patch("app.api.v1.webhooks._get_redis_pool") as mock_pool,
        patch("app.api.v1.webhooks.Queue") as mock_queue_cls,
    ):
        mock_pool.return_value = MagicMock()
        mock_q = MagicMock()
        mock_queue_cls.return_value = mock_q

        _enqueue_task({"entry": []}, "tenant-abc")

    call_kwargs = mock_q.enqueue.call_args[1]
    assert "retry" in call_kwargs, "retry kwarg missing from enqueue call"
    retry_obj = call_kwargs["retry"]
    assert isinstance(retry_obj, Retry)
    assert retry_obj.max == 3
    assert retry_obj.intervals == [10, 30, 60]


def test_enqueue_task_reuses_pool():
    from app.api.v1.webhooks import _enqueue_task
    import app.api.v1.webhooks as wh_module

    # Reset pool to ensure clean state
    wh_module._redis_pool = None

    with patch("app.api.v1.webhooks.Redis") as mock_redis_cls:
        mock_redis_cls.from_url.return_value = MagicMock()
        with patch("app.api.v1.webhooks.Queue") as mock_queue_cls:
            mock_queue_cls.return_value = MagicMock()
            _enqueue_task({"entry": []}, "t1")
            _enqueue_task({"entry": []}, "t2")

    assert mock_redis_cls.from_url.call_count == 1, "Redis.from_url must be called once (pool), not per request"


# ---------------------------------------------------------------------------
# INFRA-01: Webhook idempotency via Redis SET NX
# ---------------------------------------------------------------------------


def test_duplicate_message_id_returns_200_without_enqueue(client, monkeypatch):
    """Second delivery of same message ID returns 200 without enqueuing (INFRA-01)."""
    import app.core.security as sec_module
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    mock_redis = MagicMock()
    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant),
        patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue,
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
    ):
        # First delivery: SET NX returns True (key is new)
        mock_redis.set.return_value = True
        response1 = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )

        # Second delivery: SET NX returns None (key already exists)
        mock_redis.set.return_value = None
        response2 = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )

    assert response1.status_code == 200
    assert response2.status_code == 200
    assert mock_enqueue.call_count == 1, f"Expected 1 enqueue call, got {mock_enqueue.call_count}"


def test_first_delivery_enqueues_job(client, monkeypatch):
    """First delivery with a new message ID enqueues exactly one job."""
    import app.core.security as sec_module
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    mock_redis = MagicMock()
    mock_redis.set.return_value = True  # SET NX succeeds — new key

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant),
        patch("app.api.v1.webhooks._enqueue_task") as mock_enqueue,
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
    ):
        response = client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )

    assert response.status_code == 200
    mock_enqueue.assert_called_once()


def test_dedup_key_uses_message_id(client, monkeypatch):
    """Dedup Redis key contains the message ID with nx=True and ex=86400."""
    import app.core.security as sec_module
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    mock_tenant = _make_mock_tenant()
    body = json.dumps(_make_webhook_payload()).encode()
    sig = _sign_body(body)

    mock_redis = MagicMock()
    mock_redis.set.return_value = True

    with (
        patch("app.api.v1.webhooks.get_tenant_by_phone", return_value=mock_tenant),
        patch("app.api.v1.webhooks._enqueue_task"),
        patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis),
    ):
        client.post(
            "/api/v1/webhooks/whatsapp",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )

    mock_redis.set.assert_called_once()
    set_call_args = mock_redis.set.call_args
    key_arg = set_call_args[0][0]
    assert "wamid.test_message_id_123" in key_arg, f"Dedup key must contain message ID, got: {key_arg}"
    assert set_call_args[1].get("nx") is True, "SET must use nx=True"
    assert set_call_args[1].get("ex") == 86400, "TTL must be 86400 (24h)"

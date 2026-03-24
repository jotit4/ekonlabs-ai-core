"""Tests para app/core/security.py — HMAC verification y challenge validation."""
import hashlib
import hmac

import app.core.security as sec_module

TEST_SECRET = "test_meta_secret_xyz"
TEST_VERIFY_TOKEN = "test_verify_token_abc"


def _make_valid_signature(body: bytes, secret: str = TEST_SECRET) -> str:
    """Helper: genera una firma HMAC-SHA256 válida para los tests."""
    h = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
    return f"sha256={h.hexdigest()}"


# ---------------------------------------------------------------------------
# verify_meta_signature
# ---------------------------------------------------------------------------


def test_verify_meta_signature_valid(monkeypatch):
    """Firma HMAC correcta con secret configurado → True."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = b'{"object": "whatsapp_business_account", "entry": []}'
    sig = _make_valid_signature(body)
    assert sec_module.verify_meta_signature(body, sig) is True


def test_verify_meta_signature_invalid_hash(monkeypatch):
    """Firma con hash incorrecto → False."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = b'{"object": "whatsapp_business_account"}'
    assert sec_module.verify_meta_signature(body, "sha256=badhashvalue") is False


def test_verify_meta_signature_missing_prefix(monkeypatch):
    """Cabecera sin prefijo 'sha256=' → False."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = b"test body"
    # Firma sin el prefijo requerido
    h = hmac.new(TEST_SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert sec_module.verify_meta_signature(body, h) is False


def test_verify_meta_signature_empty_secret(monkeypatch):
    """META_APP_SECRET vacío (no configurado) → False."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", "")
    body = b"test body"
    sig = _make_valid_signature(body)
    assert sec_module.verify_meta_signature(body, sig) is False


def test_verify_meta_signature_empty_header(monkeypatch):
    """Cabecera X-Hub-Signature-256 vacía → False."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    assert sec_module.verify_meta_signature(b"body", "") is False


def test_verify_meta_signature_wrong_secret(monkeypatch):
    """Firma generada con secret distinto → False (timing-safe compare)."""
    monkeypatch.setattr(sec_module.settings, "META_APP_SECRET", TEST_SECRET)
    body = b"test payload"
    # Firmado con un secret diferente
    sig = _make_valid_signature(body, secret="wrong_secret")
    assert sec_module.verify_meta_signature(body, sig) is False


# ---------------------------------------------------------------------------
# verify_webhook_challenge
# ---------------------------------------------------------------------------


def test_verify_webhook_challenge_valid(monkeypatch):
    """mode=subscribe + token correcto → True."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    assert sec_module.verify_webhook_challenge("subscribe", TEST_VERIFY_TOKEN) is True


def test_verify_webhook_challenge_wrong_token(monkeypatch):
    """Token incorrecto → False."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    assert sec_module.verify_webhook_challenge("subscribe", "wrong_token") is False


def test_verify_webhook_challenge_wrong_mode(monkeypatch):
    """mode distinto de 'subscribe' → False."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    assert sec_module.verify_webhook_challenge("unsubscribe", TEST_VERIFY_TOKEN) is False


def test_verify_webhook_challenge_empty_verify_token_setting(monkeypatch):
    """META_VERIFY_TOKEN vacío (no configurado) → False."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", "")
    assert sec_module.verify_webhook_challenge("subscribe", "") is False


def test_verify_webhook_challenge_none_mode(monkeypatch):
    """hub.mode=None → False."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    assert sec_module.verify_webhook_challenge(None, TEST_VERIFY_TOKEN) is False


def test_verify_webhook_challenge_none_token(monkeypatch):
    """hub.verify_token=None → False."""
    monkeypatch.setattr(sec_module.settings, "META_VERIFY_TOKEN", TEST_VERIFY_TOKEN)
    assert sec_module.verify_webhook_challenge("subscribe", None) is False

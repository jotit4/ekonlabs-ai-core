"""Security utilities — Meta webhook signature verification."""
import hashlib
import hmac

from app.core.config import settings


def verify_meta_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """Verifica la cabecera X-Hub-Signature-256 de Meta usando HMAC-SHA256.

    Args:
        payload_bytes: Cuerpo raw de la petición HTTP (bytes sin decodificar).
        signature_header: Valor de la cabecera X-Hub-Signature-256 (ej: "sha256=abc123").

    Returns:
        True si la firma es válida, False en cualquier otro caso.
    """
    if not settings.META_APP_SECRET:
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected = signature_header[7:]  # Remove "sha256=" prefix
    computed = hmac.new(
        settings.META_APP_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, expected)


def verify_webhook_challenge(mode: str | None, token: str | None) -> bool:
    """Verifica el challenge de verificación de webhook enviado por Meta (GET).

    Args:
        mode: Valor de hub.mode en el query string (debe ser "subscribe").
        token: Valor de hub.verify_token en el query string.

    Returns:
        True si el challenge es válido, False en cualquier otro caso.
    """
    if not settings.META_VERIFY_TOKEN:
        return False
    return mode == "subscribe" and token == settings.META_VERIFY_TOKEN

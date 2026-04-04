"""Evolution API — envío de mensajes WhatsApp via REST."""
import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def send_message(to_phone: str, message_text: str) -> None:
    """Envía un mensaje de texto via Evolution API REST.

    Args:
        to_phone: Número destinatario sin "+" ni sufijos (ej: "5491112345678").
        message_text: Texto plano del mensaje.

    Raises:
        AppException: EVOLUTION_SEND_FAILED si el envío falla.
    """
    url = f"{settings.EVOLUTION_API_URL}/message/sendText/{settings.EVOLUTION_INSTANCE}"
    payload = {"number": to_phone, "text": message_text}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json=payload,
                headers={
                    "apikey": settings.EVOLUTION_API_KEY,
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
        logger.info("evolution.send_message.done", to=to_phone)
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "evolution.send_message.http_error",
            status_code=exc.response.status_code,
            to=to_phone,
            error=str(exc),
        )
        from app.core.exceptions import AppException
        raise AppException(
            "EVOLUTION_SEND_FAILED",
            f"Evolution API error {exc.response.status_code}",
            502,
        ) from exc
    except Exception as exc:
        logger.warning("evolution.send_message.error", to=to_phone, error=str(exc))
        from app.core.exceptions import AppException
        raise AppException(
            "EVOLUTION_SEND_FAILED",
            f"Error enviando mensaje: {exc}",
            500,
        ) from exc

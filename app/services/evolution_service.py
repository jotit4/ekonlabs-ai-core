"""Evolution API — envío de mensajes WhatsApp via REST."""
import time

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Per-attempt timeout kept short so 1 retry + 1s sleep stays within 12s total
# (well inside the 20s Meta webhook timeout).
_SEND_TIMEOUT_S = 5.0
_SEND_RETRY_DELAY_S = 1.0


def send_message(to_phone: str, message_text: str) -> None:
    """Envía un mensaje de texto via Evolution API REST.

    Intenta una vez; en caso de error de red/5xx espera 1s y reintenta una vez más.
    Total worst-case: 5s + 1s + 5s = 11s < 20s webhook timeout de Meta.

    Args:
        to_phone: Número destinatario sin "+" ni sufijos (ej: "5491112345678").
        message_text: Texto plano del mensaje.

    Raises:
        AppException: EVOLUTION_SEND_FAILED si ambos intentos fallan.
    """
    from app.core.exceptions import AppException

    url = f"{settings.EVOLUTION_API_URL}/message/sendText/{settings.EVOLUTION_INSTANCE}"
    payload = {"number": to_phone, "text": message_text}
    headers = {
        "apikey": settings.EVOLUTION_API_KEY,
        "Content-Type": "application/json",
    }

    last_exc: Exception | None = None
    for attempt in range(2):
        if attempt > 0:
            time.sleep(_SEND_RETRY_DELAY_S)
        try:
            with httpx.Client(timeout=_SEND_TIMEOUT_S) as client:
                resp = client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
            logger.info("evolution.send_message.done", to=to_phone, attempt=attempt)
            return
        except httpx.HTTPStatusError as exc:
            # 4xx are client errors — no point retrying
            if exc.response.status_code < 500:
                logger.warning(
                    "evolution.send_message.client_error",
                    status_code=exc.response.status_code,
                    to=to_phone,
                )
                raise AppException(
                    "EVOLUTION_SEND_FAILED",
                    f"Evolution API error {exc.response.status_code}",
                    502,
                ) from exc
            logger.warning(
                "evolution.send_message.server_error",
                status_code=exc.response.status_code,
                attempt=attempt,
                to=to_phone,
            )
            last_exc = exc
        except Exception as exc:
            logger.warning(
                "evolution.send_message.error", attempt=attempt, to=to_phone, error=str(exc)
            )
            last_exc = exc

    raise AppException(
        "EVOLUTION_SEND_FAILED",
        f"Error enviando mensaje tras 2 intentos: {last_exc}",
        500,
    ) from last_exc

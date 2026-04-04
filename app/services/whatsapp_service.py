"""Meta Graph API — envio de mensajes WhatsApp."""
import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)
_META_MESSAGES_URL = "https://graph.facebook.com/v19.0/{phone_number_id}/messages"


def send_message(
    phone_number_id: str,
    to_phone: str,
    message_text: str,
    access_token: str,
) -> None:
    """Envia un mensaje de texto a traves de Meta Graph API.

    Args:
        phone_number_id: ID del numero de negocio Meta (del webhook metadata).
        to_phone: Numero del destinatario en formato Meta (sin "+", ej: "15551234567").
        message_text: Texto plano del mensaje a enviar.
        access_token: Meta permanent access token (META_ACCESS_TOKEN de settings).

    Raises:
        AppException: WHATSAPP_SEND_FAILED si el envio falla.
    """
    url = _META_MESSAGES_URL.format(phone_number_id=phone_number_id)
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": message_text},
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
        logger.info(
            "whatsapp.send_message.done",
            to=to_phone,
            phone_number_id=phone_number_id,
        )
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "whatsapp.send_message.http_error",
            status_code=exc.response.status_code,
            to=to_phone,
            error=str(exc),
        )
        from app.core.exceptions import AppException
        raise AppException(
            "WHATSAPP_SEND_FAILED",
            f"Meta API error {exc.response.status_code}",
            502,
        ) from exc
    except Exception as exc:
        logger.warning(
            "whatsapp.send_message.error",
            to=to_phone,
            error=str(exc),
        )
        from app.core.exceptions import AppException
        raise AppException(
            "WHATSAPP_SEND_FAILED",
            f"Error enviando mensaje: {exc}",
            500,
        ) from exc

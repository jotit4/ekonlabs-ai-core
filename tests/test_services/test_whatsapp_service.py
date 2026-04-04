"""Tests para app/services/whatsapp_service.py — send_message (Story 2.3)."""
from unittest.mock import MagicMock, patch

import httpx
import pytest

_PHONE_NUMBER_ID = "106540352242922"
_TO_PHONE = "15551234567"
_MESSAGE_TEXT = "Hola, le confirmamos su turno."
_ACCESS_TOKEN = "EAAG_fake_token_for_tests"


def test_send_message_calls_meta_api():
    """send_message realiza POST a Meta Graph API con payload y headers correctos."""
    from app.services.whatsapp_service import send_message

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None

    with patch("app.services.whatsapp_service.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        send_message(_PHONE_NUMBER_ID, _TO_PHONE, _MESSAGE_TEXT, _ACCESS_TOKEN)

    # Verificar que se llamó POST con URL correcta
    call_args = mock_client.post.call_args
    url = call_args[0][0]
    assert _PHONE_NUMBER_ID in url
    assert "graph.facebook.com" in url

    # Verificar payload
    sent_payload = call_args[1]["json"]
    assert sent_payload["messaging_product"] == "whatsapp"
    assert sent_payload["to"] == _TO_PHONE
    assert sent_payload["type"] == "text"
    assert sent_payload["text"]["body"] == _MESSAGE_TEXT

    # Verificar headers
    headers = call_args[1]["headers"]
    assert headers["Authorization"] == f"Bearer {_ACCESS_TOKEN}"


def test_send_message_raises_on_http_error():
    """HTTPStatusError de Meta API → raise AppException con código WHATSAPP_SEND_FAILED."""
    from app.core.exceptions import AppException
    from app.services.whatsapp_service import send_message

    mock_response = MagicMock()
    mock_response.status_code = 401
    http_error = httpx.HTTPStatusError(
        "Unauthorized", request=MagicMock(), response=mock_response
    )

    with patch("app.services.whatsapp_service.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_client.post.return_value.raise_for_status.side_effect = http_error

        with pytest.raises(AppException) as exc_info:
            send_message(_PHONE_NUMBER_ID, _TO_PHONE, _MESSAGE_TEXT, _ACCESS_TOKEN)

    assert exc_info.value.code == "WHATSAPP_SEND_FAILED"
    assert exc_info.value.status_code == 502


def test_send_message_raises_on_connection_error():
    """Error de red (httpx.ConnectError) → raise AppException con status_code 500."""
    from app.core.exceptions import AppException
    from app.services.whatsapp_service import send_message

    with patch("app.services.whatsapp_service.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_client.post.side_effect = httpx.ConnectError("connection refused")

        with pytest.raises(AppException) as exc_info:
            send_message(_PHONE_NUMBER_ID, _TO_PHONE, _MESSAGE_TEXT, _ACCESS_TOKEN)

    assert exc_info.value.code == "WHATSAPP_SEND_FAILED"
    assert exc_info.value.status_code == 500

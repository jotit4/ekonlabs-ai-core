"""Tests for evolution_service.send_message()."""
from unittest.mock import MagicMock, patch

import httpx
import pytest


def test_send_message_posts_correct_payload(monkeypatch):
    """send_message posts to correct URL with apikey header and correct body."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        from app.services.evolution_service import send_message
        result = send_message("5491112345678", "Hola!")

    assert result is None
    mock_client.post.assert_called_once_with(
        "https://evo.example.com/message/sendText/test-instance",
        json={"number": "5491112345678", "text": "Hola!"},
        headers={"apikey": "test-apikey", "Content-Type": "application/json"},
    )


def test_send_message_raises_on_http_error(monkeypatch):
    """send_message raises AppException(502) on HTTP 4xx/5xx."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    mock_response = MagicMock()
    mock_response.status_code = 422
    http_error = httpx.HTTPStatusError("error", request=MagicMock(), response=mock_response)

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = http_error
        mock_client_cls.return_value = mock_client

        from app.core.exceptions import AppException
        from app.services.evolution_service import send_message

        with pytest.raises(AppException) as exc_info:
            send_message("5491112345678", "Hola!")

    assert exc_info.value.code == "EVOLUTION_SEND_FAILED"
    assert exc_info.value.status_code == 502


def test_send_message_raises_on_network_error(monkeypatch):
    """send_message raises AppException(500) on network/connection error."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = httpx.ConnectError("connection refused")
        mock_client_cls.return_value = mock_client

        from app.core.exceptions import AppException
        from app.services.evolution_service import send_message

        with pytest.raises(AppException) as exc_info:
            send_message("5491112345678", "Hola!")

    assert exc_info.value.code == "EVOLUTION_SEND_FAILED"
    assert exc_info.value.status_code == 500

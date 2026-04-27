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
    """send_message raises AppException(500) on network/connection error (both retries fail)."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    with (
        patch("httpx.Client") as mock_client_cls,
        patch("app.services.evolution_service.time.sleep"),
    ):
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
    assert mock_client.post.call_count == 2  # both retries attempted


def test_send_message_succeeds_on_second_attempt(monkeypatch):
    """send_message retries on 503 and succeeds on second attempt."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    fail_response = MagicMock()
    fail_response.status_code = 503
    http_503 = httpx.HTTPStatusError("503", request=MagicMock(), response=fail_response)

    ok_response = MagicMock()
    ok_response.raise_for_status.return_value = None

    with (
        patch("httpx.Client") as mock_client_cls,
        patch("app.services.evolution_service.time.sleep") as mock_sleep,
    ):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = [http_503, ok_response]
        mock_client_cls.return_value = mock_client

        from app.services.evolution_service import send_message
        result = send_message("5491112345678", "Hola!")

    assert result is None
    assert mock_client.post.call_count == 2
    mock_sleep.assert_called_once_with(1.0)


def test_send_message_no_retry_on_4xx(monkeypatch):
    """send_message does NOT retry on 4xx client errors (immediate raise)."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-apikey")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "test-instance")

    fail_response = MagicMock()
    fail_response.status_code = 401
    http_401 = httpx.HTTPStatusError("401", request=MagicMock(), response=fail_response)

    with (
        patch("httpx.Client") as mock_client_cls,
        patch("app.services.evolution_service.time.sleep") as mock_sleep,
    ):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = http_401
        mock_client_cls.return_value = mock_client

        from app.core.exceptions import AppException
        from app.services.evolution_service import send_message

        with pytest.raises(AppException):
            send_message("5491112345678", "Hola!")

    assert mock_client.post.call_count == 1  # no retry for 4xx
    mock_sleep.assert_not_called()

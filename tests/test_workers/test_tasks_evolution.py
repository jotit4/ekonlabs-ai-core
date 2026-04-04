"""Tests for Evolution provider dispatch in process_whatsapp_message (Phase 10)."""
from unittest.mock import MagicMock, call, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.core.exceptions import AppException

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "5491199999999"
_AI_RESPONSE = "Hola, te agendo el turno."


def _make_evolution_task_payload(phone=_PHONE, text="turno", msg_id="EV001"):
    return {
        "provider": "evolution",
        "entry": [{"id": "clinic-isadi", "changes": [{"value": {
            "messaging_product": "whatsapp",
            "metadata": {"display_phone_number": "", "phone_number_id": ""},
            "contacts": [],
            "messages": [{
                "from": phone,
                "id": msg_id,
                "timestamp": "1717689097",
                "type": "text",
                "text": {"body": text},
            }],
        }, "field": "messages"}]}],
    }


def _make_meta_task_payload(phone="15551234567", text="info"):
    return {
        "object": "whatsapp_business_account",
        "entry": [{"id": "ENTRY_123", "changes": [{
            "value": {
                "messaging_product": "whatsapp",
                "metadata": {"display_phone_number": "15550051237", "phone_number_id": "106540352242922"},
                "contacts": [{"profile": {"name": "Test"}, "wa_id": phone}],
                "messages": [{
                    "from": phone,
                    "id": "wamid.test_meta",
                    "timestamp": "1680000000",
                    "type": "text",
                    "text": {"body": text},
                }],
            },
            "field": "messages",
        }]}],
    }


def _base_mocks():
    """Returns dict of patches needed for all tests."""
    return {
        "graph": patch("app.workers.tasks.conversation_graph"),
        "history": patch("app.workers.tasks.get_conversation_history", return_value=[]),
        "save": patch("app.workers.tasks.save_message"),
        "tenant_cfg": patch("app.workers.tasks.get_tenant_config", side_effect=AppException("NOT_FOUND", "not found", 404)),
        "thread_status": patch("app.workers.tasks.get_thread_status", return_value="active"),
        "set_active": patch("app.workers.tasks.set_thread_active"),
        "set_paused": patch("app.workers.tasks.set_thread_paused"),
    }


def test_evolution_provider_calls_evolution_send(monkeypatch):
    """When provider=evolution, tasks.py calls evolution_service.send_message()."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-key")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "clinic-isadi")

    payload = _make_evolution_task_payload()
    mocks = _base_mocks()

    with mocks["graph"] as mock_graph, \
         mocks["history"], \
         mocks["save"] as mock_save, \
         mocks["tenant_cfg"], \
         mocks["thread_status"], \
         mocks["set_active"], \
         mocks["set_paused"], \
         patch("app.services.evolution_service.send_message") as mock_evo_send:

        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=_AI_RESPONSE)],
        }

        from app.workers.tasks import process_whatsapp_message
        process_whatsapp_message(payload, _TENANT_ID)

    mock_evo_send.assert_called_once_with(to_phone=_PHONE, message_text=_AI_RESPONSE)


def test_evolution_provider_skips_send_on_empty_settings(monkeypatch):
    """When provider=evolution but EVOLUTION_API_KEY is empty, skip send but still save."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "clinic-isadi")

    payload = _make_evolution_task_payload()
    mocks = _base_mocks()

    with mocks["graph"] as mock_graph, \
         mocks["history"], \
         mocks["save"] as mock_save, \
         mocks["tenant_cfg"], \
         mocks["thread_status"], \
         mocks["set_active"], \
         mocks["set_paused"], \
         patch("app.services.evolution_service.send_message") as mock_evo_send:

        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=_AI_RESPONSE)],
        }

        from app.workers.tasks import process_whatsapp_message
        process_whatsapp_message(payload, _TENANT_ID)

    mock_evo_send.assert_not_called()
    mock_save.assert_called()  # called for user message + assistant message


def test_evolution_provider_send_error_does_not_crash(monkeypatch):
    """Evolution send error is caught — worker returns normally and still saves message."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-key")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "clinic-isadi")

    payload = _make_evolution_task_payload()
    mocks = _base_mocks()

    with mocks["graph"] as mock_graph, \
         mocks["history"], \
         mocks["save"] as mock_save, \
         mocks["tenant_cfg"], \
         mocks["thread_status"], \
         mocks["set_active"], \
         mocks["set_paused"], \
         patch("app.services.evolution_service.send_message",
               side_effect=AppException("EVOLUTION_SEND_FAILED", "error", 502)):

        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=_AI_RESPONSE)],
        }

        from app.workers.tasks import process_whatsapp_message
        # Should not raise
        process_whatsapp_message(payload, _TENANT_ID)

    mock_save.assert_called()  # called for user + assistant messages


def test_meta_provider_payload_without_provider_key_uses_meta_path(monkeypatch):
    """Payload without 'provider' key defaults to meta path — backward compat."""
    monkeypatch.setattr("app.core.config.settings.META_ACCESS_TOKEN", "test-meta-token")

    payload = _make_meta_task_payload()
    mocks = _base_mocks()

    with mocks["graph"] as mock_graph, \
         mocks["history"], \
         mocks["save"], \
         mocks["tenant_cfg"], \
         mocks["thread_status"], \
         mocks["set_active"], \
         mocks["set_paused"], \
         patch("app.workers.tasks.send_whatsapp_message") as mock_meta_send, \
         patch("app.services.evolution_service.send_message") as mock_evo_send:

        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=_AI_RESPONSE)],
        }

        from app.workers.tasks import process_whatsapp_message
        process_whatsapp_message(payload, _TENANT_ID)

    mock_meta_send.assert_called_once()
    mock_evo_send.assert_not_called()


def test_evolution_provider_save_message_called_after_send(monkeypatch):
    """save_message is called with role=assistant and ai_text after Evolution send."""
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_KEY", "test-key")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_API_URL", "https://evo.example.com")
    monkeypatch.setattr("app.core.config.settings.EVOLUTION_INSTANCE", "clinic-isadi")

    payload = _make_evolution_task_payload()
    mocks = _base_mocks()

    with mocks["graph"] as mock_graph, \
         mocks["history"], \
         mocks["save"] as mock_save, \
         mocks["tenant_cfg"], \
         mocks["thread_status"], \
         mocks["set_active"], \
         mocks["set_paused"], \
         patch("app.services.evolution_service.send_message"):

        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=_AI_RESPONSE)],
        }

        from app.workers.tasks import process_whatsapp_message
        process_whatsapp_message(payload, _TENANT_ID)

    # save_message is called twice: once for user message, once for assistant
    mock_save.assert_any_call(
        phone_number=_PHONE,
        tenant_id=_TENANT_ID,
        role="assistant",
        content=_AI_RESPONSE,
    )

"""Tests para app/workers/tasks.py — tarea RQ process_whatsapp_message (Story 2.2)."""
import asyncio
from unittest.mock import MagicMock, patch

from langchain_core.messages import HumanMessage

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"
_MESSAGE_TEXT = "Hola, quiero info sobre ortodoncia"

# Payload con formato by_alias=True (fix F1 de Story 2.1 code review)
# Clave "from" (original de Meta API), NO "from_" (nombre Python interno de Pydantic)
_SAMPLE_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_123", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {
                "display_phone_number": "15550051237",
                "phone_number_id": "106540352242922",
            },
            "contacts": [{"profile": {"name": "Test User"}, "wa_id": _PHONE}],
            "messages": [{
                "from": _PHONE,          # ← "from" con by_alias=True (Story 2.1 fix F1)
                "id": "wamid.test_message_id_123",
                "timestamp": "1680000000",
                "type": "text",
                "text": {"body": _MESSAGE_TEXT},
            }],
        },
        "field": "messages",
    }]},
]}

_EMPTY_PAYLOAD = {"object": "whatsapp_business_account", "entry": []}

_PAYLOAD_NO_MESSAGES = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_123", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {"display_phone_number": "15550051237", "phone_number_id": "xxx"},
            "contacts": [],
            # Sin clave "messages"
        },
        "field": "messages",
    }]},
]}


def _make_mock_tenant_config(system_prompt=None):
    mock = MagicMock()
    mock.system_prompt_override = system_prompt
    return mock


# ---------------------------------------------------------------------------
# Flujo completo (happy path)
# ---------------------------------------------------------------------------


def test_process_whatsapp_message_calls_all_services():
    """Happy path: carga historial, invoca grafo, guarda mensaje de usuario."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]) as mock_hist,
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()) as mock_config,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        mock_graph.invoke.return_value = {"messages": [HumanMessage(content=_MESSAGE_TEXT)]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_hist.assert_called_once_with(phone_number=_PHONE, tenant_id=_TENANT_ID)
    mock_config.assert_called_once_with(_TENANT_ID)
    mock_graph.invoke.assert_called_once()
    mock_save.assert_called_once_with(
        phone_number=_PHONE,
        tenant_id=_TENANT_ID,
        role="user",
        content=_MESSAGE_TEXT,
    )


def test_process_whatsapp_message_passes_correct_thread_id():
    """graph.invoke recibe config con thread_id correcto: '{tenant_id}:{phone_number}'."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    call_kwargs = mock_graph.invoke.call_args
    config = call_kwargs[1].get("config") or call_kwargs[0][1]
    assert config["configurable"]["thread_id"] == f"{_TENANT_ID}:{_PHONE}"


def test_process_whatsapp_message_builds_state_with_human_message():
    """El ConversationState incluye HumanMessage con el texto del paciente."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    state_arg = mock_graph.invoke.call_args[0][0]
    assert state_arg["tenant_id"] == _TENANT_ID
    assert state_arg["phone_number"] == _PHONE
    assert state_arg["confidence_score"] == 1.0
    assert state_arg["is_paused"] is False
    # Verificar que el último mensaje es el HumanMessage entrante
    last_msg = state_arg["messages"][-1]
    assert isinstance(last_msg, HumanMessage)
    assert last_msg.content == _MESSAGE_TEXT


def test_process_whatsapp_message_loads_history_into_state():
    """El historial de Supabase se convierte a LangChain messages y se pasa al grafo."""
    from app.workers.tasks import process_whatsapp_message

    history_rows = [
        {"role": "user", "content": "Consulta anterior"},
        {"role": "assistant", "content": "Respuesta anterior"},
    ]
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=history_rows),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    state_arg = mock_graph.invoke.call_args[0][0]
    # Historial (2) + nuevo mensaje (1) = 3 mensajes en total
    assert len(state_arg["messages"]) == 3
    assert state_arg["messages"][0].content == "Consulta anterior"
    assert state_arg["messages"][1].content == "Respuesta anterior"
    assert state_arg["messages"][2].content == _MESSAGE_TEXT


def test_process_whatsapp_message_includes_system_prompt_when_present():
    """Si el tenant tiene system_prompt_override, se incluye en el estado."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config",
              return_value=_make_mock_tenant_config(system_prompt="Eres una IA médica.")),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    state_arg = mock_graph.invoke.call_args[0][0]
    assert state_arg.get("system_prompt") == "Eres una IA médica."


def test_process_whatsapp_message_no_system_prompt_when_none():
    """Si system_prompt_override es None, la clave no se incluye en el estado."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config",
              return_value=_make_mock_tenant_config(system_prompt=None)),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    state_arg = mock_graph.invoke.call_args[0][0]
    assert "system_prompt" not in state_arg


# ---------------------------------------------------------------------------
# AC5: Manejo defensivo de payloads incompletos
# ---------------------------------------------------------------------------


def test_process_whatsapp_message_skips_on_empty_payload():
    """Payload sin entries → no llama a graph ni save_message (AC5)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        process_whatsapp_message(_EMPTY_PAYLOAD, _TENANT_ID)

    mock_hist.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_process_whatsapp_message_skips_on_missing_messages_key():
    """Payload sin clave 'messages' → retorna sin error (AC5)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        process_whatsapp_message(_PAYLOAD_NO_MESSAGES, _TENANT_ID)

    mock_hist.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


# ---------------------------------------------------------------------------
# Resiliencia ante errores
# ---------------------------------------------------------------------------


def test_process_whatsapp_message_continues_on_tenant_config_error():
    """AppException en get_tenant_config → continúa sin system_prompt (no aborta)."""
    from app.workers.tasks import process_whatsapp_message
    from app.core.exceptions import AppException

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config",
              side_effect=AppException(code="TENANT_NOT_FOUND", message="Not found", status_code=404)),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        mock_graph.invoke.return_value = {}
        # No debe lanzar excepción
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # El grafo se invocó de todos modos (sin system_prompt)
    mock_graph.invoke.assert_called_once()
    # El mensaje se guardó de todos modos
    mock_save.assert_called_once()


def test_process_whatsapp_message_handles_graph_exception():
    """Excepción en graph.invoke → no propaga, no llama a save_message."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        mock_graph.invoke.side_effect = Exception("LangGraph internal error")
        # No debe propagar la excepción
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # No debe guardar el mensaje si el grafo falló
    mock_save.assert_not_called()


def test_process_whatsapp_message_is_synchronous():
    """La función es sincrónica (no es coroutine) — requerimiento de workers RQ."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
    ):
        mock_graph.invoke.return_value = {}
        result = process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    assert not asyncio.iscoroutine(result)
    assert result is None


# ---------------------------------------------------------------------------
# _extract_message_info helper
# ---------------------------------------------------------------------------


def test_extract_message_info_returns_phone_and_text():
    """Payload válido → retorna (phone_number, message_text)."""
    from app.workers.tasks import _extract_message_info
    result = _extract_message_info(_SAMPLE_PAYLOAD)
    assert result == (_PHONE, _MESSAGE_TEXT)


def test_extract_message_info_returns_none_on_empty_payload():
    """Payload sin entries → retorna None."""
    from app.workers.tasks import _extract_message_info
    result = _extract_message_info(_EMPTY_PAYLOAD)
    assert result is None


def test_extract_message_info_returns_none_on_missing_messages():
    """Payload sin clave 'messages' → retorna None."""
    from app.workers.tasks import _extract_message_info
    result = _extract_message_info(_PAYLOAD_NO_MESSAGES)
    assert result is None


def test_extract_message_info_returns_none_on_missing_text_body():
    """Mensaje sin campo 'text.body' (ej. audio) → retorna None."""
    from app.workers.tasks import _extract_message_info
    payload_audio = {
        "entry": [{"changes": [{"value": {"messages": [{"from": _PHONE, "type": "audio"}]}}]}]
    }
    result = _extract_message_info(payload_audio)
    assert result is None


# ---------------------------------------------------------------------------
# _build_lc_messages helper
# ---------------------------------------------------------------------------


def test_build_lc_messages_converts_all_roles():
    """Roles user/assistant/system se convierten a HumanMessage/AIMessage/SystemMessage."""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from app.workers.tasks import _build_lc_messages

    rows = [
        {"role": "user", "content": "Hola"},
        {"role": "assistant", "content": "Bienvenido"},
        {"role": "system", "content": "Contexto del sistema"},
    ]
    result = _build_lc_messages(rows, "Nueva consulta")

    assert len(result) == 4
    assert isinstance(result[0], HumanMessage)
    assert isinstance(result[1], AIMessage)
    assert isinstance(result[2], SystemMessage)   # ← fix H1: system → SystemMessage
    assert isinstance(result[3], HumanMessage)
    assert result[3].content == "Nueva consulta"


def test_build_lc_messages_appends_new_message_last():
    """El nuevo mensaje del paciente siempre queda al final."""
    from langchain_core.messages import HumanMessage
    from app.workers.tasks import _build_lc_messages

    result = _build_lc_messages([], "Primera consulta")
    assert len(result) == 1
    assert isinstance(result[0], HumanMessage)
    assert result[0].content == "Primera consulta"


def test_build_lc_messages_with_empty_history():
    """Historial vacío → solo el mensaje nuevo."""
    from app.workers.tasks import _build_lc_messages
    result = _build_lc_messages([], "Hola")
    assert len(result) == 1

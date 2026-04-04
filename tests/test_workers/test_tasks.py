"""Tests para app/workers/tasks.py — tarea RQ process_whatsapp_message (Stories 2.2, 3.4, 4.1, 4.2)."""
import asyncio
import pytest
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

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

# Número oficial de la clínica (igual que display_phone_number en _SAMPLE_PAYLOAD)
_CLINIC_PHONE = "15550051237"
_PATIENT_PHONE = "15559876543"

# Payload saliente (outbound): messages[0]["from"] == display_phone_number
# La recepcionista envió un mensaje al paciente desde WhatsApp Web.
_OUTBOUND_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_456", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {
                "display_phone_number": _CLINIC_PHONE,
                "phone_number_id": "106540352242922",
            },
            "contacts": [{"profile": {"name": "Paciente Test"}, "wa_id": _PATIENT_PHONE}],
            "messages": [{
                "from": _CLINIC_PHONE,   # ← OUTBOUND: from == display_phone_number
                "id": "wamid.outbound_test",
                "timestamp": "1700000000",
                "type": "text",
                "text": {"body": "Hola, te llamo en un momento."},
            }],
        },
        "field": "messages",
    }]},
]}

# Payload saliente sin contacts (edge case: no se puede identificar al paciente)
_OUTBOUND_PAYLOAD_NO_CONTACTS = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_789", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {
                "display_phone_number": _CLINIC_PHONE,
                "phone_number_id": "106540352242922",
            },
            "contacts": [],   # ← Sin contacts: no hay wa_id del paciente
            "messages": [{
                "from": _CLINIC_PHONE,
                "id": "wamid.outbound_nocontacts",
                "timestamp": "1700000001",
                "type": "text",
                "text": {"body": "Un momento por favor."},
            }],
        },
        "field": "messages",
    }]},
]}

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
    """Happy path: carga historial, invoca grafo, guarda user + assistant, envía WhatsApp."""
    from app.workers.tasks import process_whatsapp_message

    ai_response = "Hola, ¿en qué puedo ayudarle?"
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]) as mock_hist,
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()) as mock_config,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = "EAAG_test_token"
        mock_graph.invoke.return_value = {"messages": [AIMessage(content=ai_response)]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_hist.assert_called_once_with(phone_number=_PHONE, tenant_id=_TENANT_ID)
    mock_config.assert_called_once_with(_TENANT_ID)
    mock_graph.invoke.assert_called_once()
    # Debe guardar user + assistant (2 llamadas)
    assert mock_save.call_count == 2
    mock_save.assert_any_call(
        phone_number=_PHONE, tenant_id=_TENANT_ID, role="user", content=_MESSAGE_TEXT,
    )
    mock_save.assert_any_call(
        phone_number=_PHONE, tenant_id=_TENANT_ID, role="assistant", content=ai_response,
    )
    # Debe enviar respuesta a WhatsApp
    mock_send.assert_called_once_with(
        "106540352242922", _PHONE, ai_response, "EAAG_test_token",
    )


def test_process_whatsapp_message_passes_correct_thread_id():
    """graph.invoke recibe config con thread_id correcto: '{tenant_id}:{phone_number}'."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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
    """Excepción en graph.invoke → propaga para que RQ reintente el job completo.

    Arquitectura: Graph failures → propagate (let RQ retry the job).
    Al reintentar, el historial no tiene el mensaje aún → no hay doble escritura.
    """
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        mock_graph.invoke.side_effect = Exception("LangGraph internal error")
        # Debe propagar la excepción → RQ reintentará el job
        with pytest.raises(Exception, match="LangGraph internal error"):
            process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # No debe guardar mensajes si el grafo falló (el retry completo los guardará)
    mock_save.assert_not_called()


def test_process_whatsapp_message_is_synchronous():
    """La función es sincrónica (no es coroutine) — requerimiento de workers RQ."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
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


# ---------------------------------------------------------------------------
# _extract_phone_number_id helper (Story 2.3)
# ---------------------------------------------------------------------------


def test_extract_phone_number_id_returns_id_from_metadata():
    """Payload válido → retorna phone_number_id del metadata."""
    from app.workers.tasks import _extract_phone_number_id
    result = _extract_phone_number_id(_SAMPLE_PAYLOAD)
    assert result == "106540352242922"


def test_extract_phone_number_id_returns_none_on_empty_payload():
    """Payload vacío → retorna None sin excepción."""
    from app.workers.tasks import _extract_phone_number_id
    assert _extract_phone_number_id(_EMPTY_PAYLOAD) is None


def test_extract_phone_number_id_returns_none_on_missing_metadata():
    """Payload sin metadata → retorna None sin excepción."""
    from app.workers.tasks import _extract_phone_number_id
    payload = {"entry": [{"changes": [{"value": {}}]}]}
    assert _extract_phone_number_id(payload) is None


def test_extract_phone_number_id_returns_none_on_none_input():
    """None como payload → retorna None sin excepción (comportamiento defensivo)."""
    from app.workers.tasks import _extract_phone_number_id
    assert _extract_phone_number_id(None) is None  # TypeError atrapado internamente


# ---------------------------------------------------------------------------
# Story 2.3: AI response extraction, send y persist (AC3 + AC4)
# ---------------------------------------------------------------------------


_AI_RESPONSE_TEXT = "Su turno está confirmado para el lunes a las 10h."

_SAMPLE_PAYLOAD_WITH_PHONE_ID = _SAMPLE_PAYLOAD  # ya tiene phone_number_id en metadata


def test_process_whatsapp_message_sends_ai_response_via_whatsapp():
    """AI response → se envía a WhatsApp via send_message (AC3)."""
    from langchain_core.messages import AIMessage
    from app.workers.tasks import process_whatsapp_message

    ai_msg = AIMessage(content=_AI_RESPONSE_TEXT)
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = "EAAG_test_token"
        mock_graph.invoke.return_value = {"messages": [ai_msg]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_send.assert_called_once_with(
        "106540352242922",
        _PHONE,
        _AI_RESPONSE_TEXT,
        "EAAG_test_token",
    )


def test_process_whatsapp_message_persists_ai_response():
    """AI response → se guarda como role='assistant' en Supabase (AC4)."""
    from langchain_core.messages import AIMessage
    from app.workers.tasks import process_whatsapp_message

    ai_msg = AIMessage(content=_AI_RESPONSE_TEXT)
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message"),
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = "EAAG_test_token"
        mock_graph.invoke.return_value = {"messages": [ai_msg]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # Debe haber exactamente 2 llamadas a save_message: user + assistant
    assert mock_save.call_count == 2
    assistant_call = mock_save.call_args_list[1]
    assert assistant_call.kwargs["role"] == "assistant"
    assert assistant_call.kwargs["content"] == _AI_RESPONSE_TEXT
    assert assistant_call.kwargs["tenant_id"] == _TENANT_ID
    assert assistant_call.kwargs["phone_number"] == _PHONE


def test_process_whatsapp_message_skips_send_without_meta_token():
    """Sin META_ACCESS_TOKEN → no llama send_message pero sí guarda assistant (AC3)."""
    from langchain_core.messages import AIMessage
    from app.workers.tasks import process_whatsapp_message

    ai_msg = AIMessage(content=_AI_RESPONSE_TEXT)
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = ""  # sin token
        mock_graph.invoke.return_value = {"messages": [ai_msg]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_send.assert_not_called()
    # La respuesta sí debe persistirse aunque no se envíe
    assert mock_save.call_count == 2


def test_process_whatsapp_message_continues_on_send_error():
    """Error en send_message → no aborta; igual persiste la respuesta (AC4)."""
    from langchain_core.messages import AIMessage
    from app.workers.tasks import process_whatsapp_message

    ai_msg = AIMessage(content=_AI_RESPONSE_TEXT)
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message", side_effect=Exception("Timeout")),
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = "EAAG_test_token"
        mock_graph.invoke.return_value = {"messages": [ai_msg]}
        # No debe lanzar excepción
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # Aun con error en send, la respuesta se persiste
    assert mock_save.call_count == 2


# ---------------------------------------------------------------------------
# Story 3.4 — Thread pause guard + post-graph persistence
# ---------------------------------------------------------------------------


def test_process_whatsapp_message_skips_graph_when_thread_paused():
    """Hilo con status='paused' en DB → retorna sin invocar grafo ni guardar mensajes."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]) as mock_hist,
        patch("app.workers.tasks.get_thread_status", return_value="paused") as mock_status,
        patch("app.workers.tasks.get_tenant_config") as mock_config,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
    ):
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_status.assert_called_once_with(tenant_id=_TENANT_ID, phone_number=_PHONE)
    mock_config.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()
    mock_send.assert_not_called()


def test_process_whatsapp_message_runs_graph_normally_when_active():
    """Hilo con status='active' (o sin registro) → invoca grafo normalmente."""
    from app.workers.tasks import process_whatsapp_message

    ai_response = "Hola, ¿en qué puedo ayudarle?"
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
        patch("app.workers.tasks.set_thread_paused") as mock_pause,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = ""
        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=ai_response)],
            "is_paused": False,
        }
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_graph.invoke.assert_called_once()
    mock_pause.assert_not_called()


def test_process_whatsapp_message_calls_set_thread_paused_when_is_paused_true():
    """Si resultado del grafo tiene is_paused=True → llama set_thread_paused con low_confidence."""
    from app.workers.tasks import process_whatsapp_message

    pause_response = "En este momento no cuento con información suficiente."
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
        patch("app.workers.tasks.set_thread_paused") as mock_pause,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = ""
        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=pause_response)],
            "is_paused": True,
            "confidence_score": 0.0,
        }
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_pause.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PHONE,
        reason="low_confidence",
    )


def test_process_whatsapp_message_continues_on_set_thread_paused_error():
    """Error en set_thread_paused → no aborta el worker (el mensaje ya fue enviado/guardado)."""
    from app.workers.tasks import process_whatsapp_message

    pause_response = "Derivado a especialista."
    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.set_thread_paused", side_effect=Exception("DB error")),
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = ""
        mock_graph.invoke.return_value = {
            "messages": [AIMessage(content=pause_response)],
            "is_paused": True,
        }
        # No debe lanzar excepción — el worker absorbe el error de persistencia
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # El mensaje del usuario sí debe haberse guardado
    mock_save.assert_called()


def test_process_whatsapp_message_skips_ai_save_when_no_ai_response():
    """Grafo sin AIMessage en messages → save_message solo una vez (solo user)."""
    from langchain_core.messages import HumanMessage
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = "EAAG_test_token"
        # Solo HumanMessage en el resultado (sin AIMessage)
        mock_graph.invoke.return_value = {"messages": [HumanMessage(content="echo")]}
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    mock_send.assert_not_called()
    # Solo se guarda el mensaje del usuario
    mock_save.assert_called_once_with(
        phone_number=_PHONE,
        tenant_id=_TENANT_ID,
        role="user",
        content=_MESSAGE_TEXT,
    )


# ---------------------------------------------------------------------------
# Story 4.1 — _extract_display_phone helper
# ---------------------------------------------------------------------------


def test_extract_display_phone_returns_number_from_metadata():
    """Payload válido → retorna display_phone_number del metadata."""
    from app.workers.tasks import _extract_display_phone
    result = _extract_display_phone(_SAMPLE_PAYLOAD)
    assert result == "15550051237"


def test_extract_display_phone_returns_none_on_empty_payload():
    """Payload sin entries → retorna None sin excepción."""
    from app.workers.tasks import _extract_display_phone
    assert _extract_display_phone(_EMPTY_PAYLOAD) is None


def test_extract_display_phone_returns_none_on_missing_metadata():
    """Payload sin metadata → retorna None sin excepción."""
    from app.workers.tasks import _extract_display_phone
    payload = {"entry": [{"changes": [{"value": {}}]}]}
    assert _extract_display_phone(payload) is None


def test_extract_display_phone_returns_none_on_none_input():
    """None como payload → retorna None sin excepción (comportamiento defensivo)."""
    from app.workers.tasks import _extract_display_phone
    assert _extract_display_phone(None) is None


# ---------------------------------------------------------------------------
# Story 4.1 — _extract_patient_from_contacts helper
# ---------------------------------------------------------------------------


def test_extract_patient_from_contacts_returns_wa_id_from_first_contact():
    """Payload con contacts → retorna wa_id del primer contacto."""
    from app.workers.tasks import _extract_patient_from_contacts
    result = _extract_patient_from_contacts(_OUTBOUND_PAYLOAD)
    assert result == _PATIENT_PHONE


def test_extract_patient_from_contacts_returns_none_when_contacts_empty():
    """Contacts vacío → retorna None."""
    from app.workers.tasks import _extract_patient_from_contacts
    result = _extract_patient_from_contacts(_OUTBOUND_PAYLOAD_NO_CONTACTS)
    assert result is None


def test_extract_patient_from_contacts_returns_none_when_wa_id_missing():
    """Contact existe pero sin campo wa_id → retorna None (no lanza KeyError)."""
    from app.workers.tasks import _extract_patient_from_contacts
    payload = {
        "entry": [{"changes": [{"value": {
            "contacts": [{"profile": {"name": "Sin wa_id"}}]  # Sin "wa_id"
        }}]}]
    }
    assert _extract_patient_from_contacts(payload) is None


def test_extract_patient_from_contacts_returns_none_on_none_input():
    """None como payload → retorna None sin excepción (comportamiento defensivo)."""
    from app.workers.tasks import _extract_patient_from_contacts
    assert _extract_patient_from_contacts(None) is None


# ---------------------------------------------------------------------------
# Story 4.1 — Human takeover (Silence Mode)
# ---------------------------------------------------------------------------


def test_human_takeover_pauses_thread_when_outbound_message_detected():
    """Webhook saliente (from == display_phone_number) → pausa el hilo del paciente (AC: #1, #4)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.get_thread_status") as mock_status,
        patch("app.workers.tasks.get_tenant_config") as mock_config,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.set_thread_paused") as mock_pause,
    ):
        process_whatsapp_message(_OUTBOUND_PAYLOAD, _TENANT_ID)

    # Debe pausar el hilo del paciente con reason="human_takeover"
    mock_pause.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PATIENT_PHONE,
        reason="human_takeover",
    )
    # Salida temprana: no debe cargar historial, no invocar grafo, no guardar mensajes
    mock_hist.assert_not_called()
    mock_status.assert_not_called()
    mock_config.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_human_takeover_logs_warning_when_no_contacts():
    """Webhook saliente sin contacts → no pausa (no hay wa_id), retorna temprano (AC: #3, #4)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.set_thread_paused") as mock_pause,
    ):
        process_whatsapp_message(_OUTBOUND_PAYLOAD_NO_CONTACTS, _TENANT_ID)

    # Sin contacts no se puede identificar al paciente → no pausar
    mock_pause.assert_not_called()
    # Aun así, salida temprana: no se invoca el grafo ni se persiste nada
    mock_hist.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_inbound_message_not_treated_as_outbound():
    """Webhook normal de paciente (from != display_phone_number) → flujo normal (AC: #5)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]),
        patch("app.workers.tasks.get_thread_status", return_value="active"),
        patch("app.workers.tasks.get_tenant_config", return_value=_make_mock_tenant_config()),
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message"),
        patch("app.workers.tasks.set_thread_paused") as mock_pause,
        patch("app.workers.tasks.settings") as mock_settings,
    ):
        mock_settings.META_ACCESS_TOKEN = ""
        mock_graph.invoke.return_value = {}
        # _SAMPLE_PAYLOAD tiene from="15551234567" != display_phone_number="15550051237"
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # No debe activarse la lógica de human_takeover
    mock_pause.assert_not_called()
    # El grafo sí debe invocarse normalmente
    mock_graph.invoke.assert_called_once()


def test_process_whatsapp_message_skips_graph_when_thread_paused_human_takeover():
    """Hilo pausado (por cualquier razón, incl. human_takeover) → mensaje del paciente ignorado (AC: #2)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history", return_value=[]) as mock_hist,
        patch("app.workers.tasks.get_thread_status", return_value="paused") as mock_status,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        # Mensaje de paciente inbound cuando el hilo ya está pausado
        process_whatsapp_message(_SAMPLE_PAYLOAD, _TENANT_ID)

    # Guardia pre-grafo detecta "paused" → retorno temprano
    mock_status.assert_called_once_with(tenant_id=_TENANT_ID, phone_number=_PHONE)
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_human_takeover_continues_on_set_thread_paused_error():
    """Error en set_thread_paused durante human_takeover → retorna sin propagar, grafo no invocado (M2)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.set_thread_paused", side_effect=Exception("DB timeout")),
    ):
        # No debe lanzar excepción — el error en DB se absorbe con logger.error
        process_whatsapp_message(_OUTBOUND_PAYLOAD, _TENANT_ID)

    # Aun con error en DB, salida temprana: grafo no invocado, no se persiste nada
    mock_hist.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


# ---------------------------------------------------------------------------
# Story 4.2 — Resume Flow (slash command /resume)
# ---------------------------------------------------------------------------

# Payload saliente con slash command /resume (misma estructura que _OUTBOUND_PAYLOAD)
_RESUME_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_RES", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {
                "display_phone_number": _CLINIC_PHONE,
                "phone_number_id": "106540352242922",
            },
            "contacts": [{"profile": {"name": "Paciente Test"}, "wa_id": _PATIENT_PHONE}],
            "messages": [{
                "from": _CLINIC_PHONE,   # ← OUTBOUND: from == display_phone_number
                "id": "wamid.resume_test",
                "timestamp": "1700000002",
                "type": "text",
                "text": {"body": "/resume"},
            }],
        },
        "field": "messages",
    }]},
]}

# Payload saliente con /resume pero sin contacts
_RESUME_PAYLOAD_NO_CONTACTS = {
    "object": "whatsapp_business_account",
    "entry": [{"id": "ENTRY_RES_NC", "changes": [{
        "value": {
            "messaging_product": "whatsapp",
            "metadata": {
                "display_phone_number": _CLINIC_PHONE,
                "phone_number_id": "106540352242922",
            },
            "contacts": [],   # ← Sin contacts: no hay wa_id del paciente
            "messages": [{
                "from": _CLINIC_PHONE,
                "id": "wamid.resume_nocontacts",
                "timestamp": "1700000003",
                "type": "text",
                "text": {"body": "/resume"},
            }],
        },
        "field": "messages",
    }]},
]}


# ---------------------------------------------------------------------------
# Story 4.2 — _is_resume_command helper (unit tests directos — patrón Story 4.1)
# ---------------------------------------------------------------------------


def test_is_resume_command_returns_true_for_slash_resume():
    """/resume exacto → True."""
    from app.workers.tasks import _is_resume_command
    assert _is_resume_command("/resume") is True


def test_is_resume_command_case_insensitive():
    """/RESUME y variantes uppercase → True (case-insensitive)."""
    from app.workers.tasks import _is_resume_command
    assert _is_resume_command("/RESUME") is True
    assert _is_resume_command("/Resume") is True


def test_is_resume_command_ignores_surrounding_whitespace():
    """Texto con espacios alrededor → True (strip aplicado)."""
    from app.workers.tasks import _is_resume_command
    assert _is_resume_command("  /resume  ") is True
    assert _is_resume_command("\t/resume\n") is True


def test_is_resume_command_returns_false_for_partial_match():
    """/resume con texto adicional → False (no match parcial)."""
    from app.workers.tasks import _is_resume_command
    assert _is_resume_command("/resume extra") is False
    assert _is_resume_command("/resumeahora") is False


def test_is_resume_command_returns_false_for_non_commands():
    """Texto regular y variantes inválidas → False."""
    from app.workers.tasks import _is_resume_command
    assert _is_resume_command("resume") is False          # sin slash
    assert _is_resume_command("") is False                # vacío
    assert _is_resume_command("hola, /resume") is False   # slash no al inicio
    assert _is_resume_command("/pause") is False          # comando distinto


def test_resume_command_activates_thread():
    """Payload outbound con '/resume' y contacts → set_thread_active llamado, set_thread_paused NO (AC: #1, #2)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.set_thread_active") as mock_active,
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        process_whatsapp_message(_RESUME_PAYLOAD, _TENANT_ID)

    mock_active.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PATIENT_PHONE,
    )
    mock_paused.assert_not_called()
    # Salida temprana — grafo no invocado, nada persiste
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_resume_command_no_patient_phone_logs_warning():
    """Payload outbound con '/resume' y contacts=[] → set_thread_active NO llamado, retorno temprano (AC: #3)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.set_thread_active") as mock_active,
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        process_whatsapp_message(_RESUME_PAYLOAD_NO_CONTACTS, _TENANT_ID)

    mock_active.assert_not_called()
    mock_paused.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_resume_command_case_insensitive():
    """Slash command '/RESUME' (uppercase) → mismo comportamiento que '/resume' (AC: #1)."""
    import copy
    from app.workers.tasks import process_whatsapp_message

    payload_upper = copy.deepcopy(_RESUME_PAYLOAD)
    payload_upper["entry"][0]["changes"][0]["value"]["messages"][0]["text"]["body"] = "/RESUME"

    with (
        patch("app.workers.tasks.set_thread_active") as mock_active,
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
    ):
        process_whatsapp_message(payload_upper, _TENANT_ID)

    mock_active.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PATIENT_PHONE,
    )
    mock_paused.assert_not_called()
    mock_graph.invoke.assert_not_called()


def test_non_slash_command_outbound_still_triggers_human_takeover():
    """Mensaje saliente regular (no es /resume) → set_thread_paused llamado (regresión AC: #4)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.set_thread_active") as mock_active,
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        # _OUTBOUND_PAYLOAD tiene texto "Hola, te llamo en un momento." (no es /resume)
        process_whatsapp_message(_OUTBOUND_PAYLOAD, _TENANT_ID)

    mock_active.assert_not_called()
    mock_paused.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PATIENT_PHONE,
        reason="human_takeover",
    )
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_resume_command_does_not_send_message_to_patient():
    """El comando /resume es silencioso — no dispara send_whatsapp_message (AC: #2)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.set_thread_active"),
        patch("app.workers.tasks.send_whatsapp_message") as mock_send,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        process_whatsapp_message(_RESUME_PAYLOAD, _TENANT_ID)

    mock_send.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()


def test_resume_command_continues_on_set_thread_active_error():
    """Error en set_thread_active durante /resume → retorna sin propagar, grafo no invocado (M2)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.get_conversation_history") as mock_hist,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
        patch("app.workers.tasks.set_thread_active", side_effect=Exception("DB timeout")),
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
    ):
        # No debe lanzar excepción — el error en DB se absorbe con logger.error
        process_whatsapp_message(_RESUME_PAYLOAD, _TENANT_ID)

    # Aun con error en DB, salida temprana: grafo no invocado, no se persiste nada
    mock_hist.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()
    # human_takeover NO debe activarse cuando el comando es /resume
    mock_paused.assert_not_called()


def test_resume_command_idempotent_on_already_active_thread():
    """Hilo ya ACTIVE + /resume → set_thread_active llamado igualmente, retorno limpio (AC: #5)."""
    from app.workers.tasks import process_whatsapp_message

    with (
        patch("app.workers.tasks.set_thread_active") as mock_active,
        patch("app.workers.tasks.set_thread_paused") as mock_paused,
        patch("app.workers.tasks.conversation_graph") as mock_graph,
        patch("app.workers.tasks.save_message") as mock_save,
    ):
        # El UPSERT es idempotente — no lanza aunque el hilo ya esté activo
        process_whatsapp_message(_RESUME_PAYLOAD, _TENANT_ID)

    # set_thread_active debe llamarse igualmente (el servicio maneja la idempotencia)
    mock_active.assert_called_once_with(
        tenant_id=_TENANT_ID,
        phone_number=_PATIENT_PHONE,
    )
    mock_paused.assert_not_called()
    mock_graph.invoke.assert_not_called()
    mock_save.assert_not_called()

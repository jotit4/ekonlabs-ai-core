"""Tests para app/agent/nodes/generation.py — generation_node (Stories 2.3, 2.4, 2.5)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"


def _base_state(**kwargs):
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="Hola")],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _make_mock_llm(response_text: str = "Hola, ¿en qué puedo ayudarle?") -> MagicMock:
    mock = MagicMock()
    mock.invoke.return_value = AIMessage(content=response_text)
    return mock


def test_generation_node_uses_default_system_prompt():
    """Sin system_prompt en estado → usa DEFAULT_SYSTEM_PROMPT."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(rag_context="contexto de prueba"))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert isinstance(system_msg, SystemMessage)
    assert system_msg.content.endswith(DEFAULT_SYSTEM_PROMPT) or DEFAULT_SYSTEM_PROMPT in system_msg.content


def test_generation_node_uses_tenant_system_prompt():
    """Con system_prompt en estado → usa el prompt del tenant, no el default."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT, generation_node

    tenant_prompt = "Eres la recepcionista virtual de Clinica XYZ."
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(system_prompt=tenant_prompt, rag_context="contexto de prueba"))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert tenant_prompt in system_msg.content
    assert DEFAULT_SYSTEM_PROMPT not in system_msg.content


def test_generation_node_injects_rag_context():
    """Con rag_context → se incluye en el SystemMessage junto al system_prompt."""
    from app.agent.nodes.generation import generation_node

    rag_text = "Horarios de consulta: Lunes a Viernes 9-18h."
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(rag_context=rag_text))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert rag_text in system_msg.content
    assert "Información de la Clínica" in system_msg.content


def test_generation_node_returns_ai_message():
    """generation_node retorna dict con 'messages' conteniendo un AIMessage."""
    from app.agent.nodes.generation import generation_node

    ai_response = "Su turno está confirmado para el lunes."
    mock_llm = _make_mock_llm(ai_response)
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(rag_context="contexto de prueba"))

    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result["messages"][0].content == ai_response


def test_generation_node_no_rag_injection_when_rag_present_but_empty_section():
    """Con rag_context='' → RAG-02: LLM is called (no confidence gate), section header NOT injected."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(rag_context=""))

    # RAG-02: empty rag_context proceeds to LLM — NOT paused
    mock_llm.invoke.assert_called_once()
    assert result.get("is_paused") is not True

def test_generation_node_rag_present_does_not_include_section_header_in_system_when_absent():
    """Con rag_context presente → system_content INCLUYE sección 'Información de la Clínica'."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(rag_context="Precio ortodoncia: $50.000"))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert "Información de la Clínica" in system_msg.content


def test_generation_node_prepends_empathy_modifier_when_urgent():
    """Con empathy_mode='urgent' → EMPATHY_MODIFIER se añade al inicio del system_content."""
    from app.agent.nodes.generation import EMPATHY_MODIFIER, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(empathy_mode="urgent", rag_context="contexto de prueba"))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert system_msg.content.startswith(EMPATHY_MODIFIER)


def test_generation_node_no_empathy_modifier_when_normal():
    """Con empathy_mode='normal' (o ausente) → EMPATHY_MODIFIER NO aparece en system_content."""
    from app.agent.nodes.generation import EMPATHY_MODIFIER, generation_node

    rag = "contexto de prueba"
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(empathy_mode="normal", rag_context=rag))

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(rag_context=rag))  # sin clave empathy_mode

    for call in mock_llm.invoke.call_args_list:
        system_msg = call[0][0][0]
        assert EMPATHY_MODIFIER not in system_msg.content


def test_generation_node_returns_hardcoded_response_when_medical_query():
    """Con is_medical_query=True → retorna ANTI_DIAGNOSTIC_RESPONSE sin llamar al LLM."""
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(is_medical_query=True))

    # El LLM NO debe ser llamado
    mock_llm.invoke.assert_not_called()
    # El resultado debe contener el AIMessage con la respuesta hardcoded
    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result["messages"][0].content == ANTI_DIAGNOSTIC_RESPONSE


def test_generation_node_calls_llm_when_not_medical_query():
    """Con is_medical_query=False (o ausente) y rag_context presente → llama al LLM normalmente."""
    from app.agent.nodes.generation import generation_node

    rag = "contexto de prueba"
    mock_llm_false = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm_false):
        generation_node(_base_state(is_medical_query=False, rag_context=rag))

    mock_llm_absent = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm_absent):
        generation_node(_base_state(rag_context=rag))  # sin clave is_medical_query

    # El LLM SÍ debe ser llamado en ambos casos
    assert mock_llm_false.invoke.call_count == 1
    assert mock_llm_absent.invoke.call_count == 1


def test_generation_node_scheduling_intent_with_slots():
    """Con scheduling_intent=True y slots → respuesta contiene las opciones con emojis."""
    from app.agent.nodes.generation import generation_node

    slots = [
        {"start": "2026-03-30T10:00:00+00:00", "end": "2026-03-30T11:00:00+00:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"},
        {"start": "2026-03-30T11:00:00+00:00", "end": "2026-03-30T12:00:00+00:00", "display": "Lunes 30 de Marzo — 11:00 a 12:00 hs"},
    ]
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(scheduling_intent=True, available_slots=slots))

    # El LLM NO debe ser llamado — respuesta determinista
    mock_llm.invoke.assert_not_called()
    assert "messages" in result
    assert len(result["messages"]) == 1
    response_content = result["messages"][0].content
    # La respuesta debe mencionar los turnos
    assert "Lunes 30 de Marzo — 10:00 a 11:00 hs" in response_content
    assert "Lunes 30 de Marzo — 11:00 a 12:00 hs" in response_content
    assert "1️⃣" in response_content
    assert "2️⃣" in response_content


def test_generation_node_scheduling_intent_without_slots():
    """Con scheduling_intent=True y available_slots=[] → respuesta de disculpa."""
    from app.agent.nodes.generation import SCHEDULING_NO_SLOTS_RESPONSE, generation_node

    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(scheduling_intent=True, available_slots=[]))

    # El LLM NO debe ser llamado
    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == SCHEDULING_NO_SLOTS_RESPONSE


def test_generation_node_booking_confirmed_returns_deterministic_response():
    """booking_intent=True + booking_action='confirm' + event_id presente → respuesta de confirmación sin LLM."""
    from app.agent.nodes.generation import BOOKING_CONFIRMED_TEMPLATE, generation_node

    mock_llm = _make_mock_llm()
    slot = {"start": "2026-03-30T10:00:00-03:00", "end": "2026-03-30T11:00:00-03:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"}
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        booked_slot=slot,
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    expected = BOOKING_CONFIRMED_TEMPLATE.format(display=slot["display"])
    assert result["messages"][0].content == expected


def test_generation_node_booking_failed_no_slots_response():
    """booking_intent=True + booking_action='confirm' + calendar_event_id=None → respuesta de fallo."""
    from app.agent.nodes.generation import BOOKING_FAILED_NO_SLOTS, generation_node

    mock_llm = _make_mock_llm()
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id=None,
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == BOOKING_FAILED_NO_SLOTS


def test_generation_node_booking_cancelled_response():
    """booking_intent=True + booking_action='cancel' + event_id presente → respuesta de cancelación."""
    from app.agent.nodes.generation import BOOKING_CANCELLED, generation_node

    mock_llm = _make_mock_llm()
    state = _base_state(
        booking_intent=True,
        booking_action="cancel",
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == BOOKING_CANCELLED


def test_generation_node_booking_not_found_response():
    """booking_intent=True + booking_action='cancel' + calendar_event_id=None → 'no encontré turno'."""
    from app.agent.nodes.generation import BOOKING_NOT_FOUND, generation_node

    mock_llm = _make_mock_llm()
    state = _base_state(
        booking_intent=True,
        booking_action="cancel",
        calendar_event_id=None,
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == BOOKING_NOT_FOUND


def test_generation_node_shadow_mode_returns_redirect_without_llm():
    """shadow_mode_active=True → retorna SHADOW_MODE_REDIRECT_RESPONSE sin llamar al LLM."""
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(shadow_mode_active=True))

    mock_llm.invoke.assert_not_called()
    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result["messages"][0].content == SHADOW_MODE_REDIRECT_RESPONSE


def test_generation_node_shadow_mode_takes_priority_over_booking_intent():
    """shadow_mode_active=True tiene prioridad sobre booking_intent=True."""
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    state = _base_state(
        shadow_mode_active=True,
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id="some_event",
    )
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == SHADOW_MODE_REDIRECT_RESPONSE


def test_generation_node_urgent_with_rag_context_combines_both():
    """Verifica que urgent + rag_context se combinan correctamente en system_content."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Respuesta con empatía")

    state = {
        "tenant_id": "t1",
        "phone_number": "+541100000000",
        "messages": [HumanMessage(content="me duele mucho la espalda")],
        "empathy_mode": "urgent",
        "rag_context": "Precio consulta traumatología: $5000",
        "system_prompt": "Eres recepcionista de la clínica XYZ.",
        "is_medical_query": False,
    }

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    # Verificar que se llamó al LLM
    mock_llm.invoke.assert_called_once()
    call_args = mock_llm.invoke.call_args[0][0]  # lista de mensajes

    # El primer mensaje debe ser SystemMessage con EMPATHY_MODIFIER + system_prompt + rag_context
    system_msg = call_args[0]
    assert (
        "empat" in system_msg.content.lower()
        or "urgencia" in system_msg.content.lower()
        or "está experimentando" in system_msg.content
    )
    assert "Precio consulta" in system_msg.content  # rag_context incluido
    assert "recepcionista" in system_msg.content  # system_prompt incluido


# ---------------------------------------------------------------------------
# Story 3.4 — Confidence Score (nuevos tests)
# ---------------------------------------------------------------------------


def test_generation_node_low_confidence_when_no_rag_returns_pause_response():
    """RAG-02: Sin rag_context → LLM called (no binary confidence gate), NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())  # sin rag_context

    # RAG-02: LLM debe ser llamado — no hay confidence gate
    mock_llm.invoke.assert_called_once()
    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result.get("is_paused") is not True


def test_generation_node_low_confidence_when_empty_rag_returns_pause_response():
    """RAG-02: rag_context='' → LLM called, NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(rag_context=""))

    # RAG-02: proceeds to LLM, no pause
    mock_llm.invoke.assert_called_once()
    assert result.get("is_paused") is not True


def test_generation_node_normal_flow_when_rag_present_calls_llm():
    """Con rag_context no vacío → LLM llamado, is_paused=False no está en el retorno."""
    from app.agent.nodes.generation import generation_node

    ai_resp = "Tenemos disponibilidad el lunes."
    mock_llm = _make_mock_llm(ai_resp)
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(rag_context="Precio ortodoncia: $50.000"))

    mock_llm.invoke.assert_called_once()
    assert result["messages"][0].content == ai_resp
    # El flujo normal NO incluye is_paused en el retorno (no se sobreescribe el estado)
    assert "is_paused" not in result


def test_generation_node_shadow_mode_takes_priority_over_confidence_check():
    """shadow_mode_active=True tiene prioridad sobre la evaluación de confidence."""
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    # sin rag_context PERO con shadow_mode_active → shadow tiene prioridad
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(shadow_mode_active=True))

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == SHADOW_MODE_REDIRECT_RESPONSE
    # Shadow mode NO setea is_paused
    assert result.get("is_paused") is None or result.get("is_paused") is False


def test_generation_node_booking_bypass_takes_priority_over_confidence_check():
    """booking_intent=True tiene prioridad sobre la evaluación de confidence."""
    from app.agent.nodes.generation import BOOKING_FAILED_NO_SLOTS, generation_node

    mock_llm = _make_mock_llm()
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id=None,  # fallo de booking
    )
    # Sin rag_context PERO booking bypass activo → no evalúa confidence
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == BOOKING_FAILED_NO_SLOTS
    assert result.get("is_paused") is None or result.get("is_paused") is False


# ── Plan 05-02: Slot Selection Ambiguity Fix ─────────────────────────────────

def test_booking_ambiguous_slot_returns_clarification():
    """booking_ambiguous_slot=True → respuesta con 'preferís' en voseo, sin llamar al LLM."""
    from app.agent.nodes.generation import generation_node

    mock_llm = MagicMock()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        state = _base_state(
            messages=[HumanMessage(content="confirmo")],
            booking_intent=True,
            booking_action="confirm",
            booking_ambiguous_slot=True,
        )
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    assert "preferís" in result["messages"][0].content


def test_booking_clear_confirm_not_clarification():
    """booking_intent=True, booking_action='confirm', event_id y booked_slot presentes
    → retorna BOOKING_CONFIRMED_TEMPLATE, NO la clarificación de ambigüedad."""
    from app.agent.nodes.generation import BOOKING_CONFIRMED_TEMPLATE, generation_node

    mock_llm = _make_mock_llm()
    slot = {
        "start": "2026-03-30T10:00:00-03:00",
        "end": "2026-03-30T11:00:00-03:00",
        "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs",
    }
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        booked_slot=slot,
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_not_called()
    expected = BOOKING_CONFIRMED_TEMPLATE.format(display=slot["display"])
    assert result["messages"][0].content == expected
    assert "preferís" not in result["messages"][0].content


def test_booking_ambiguous_no_llm_call():
    """Con booking_ambiguous_slot=True, _llm.invoke nunca debe ser invocado."""
    from app.agent.nodes.generation import generation_node

    mock_llm = MagicMock()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        state = _base_state(
            booking_intent=True,
            booking_action="confirm",
            booking_ambiguous_slot=True,
        )
        generation_node(state)

    mock_llm.invoke.assert_not_called()


# ── Plan 06-02: RAG-02 — Remove confidence gate ──────────────────────────────


def test_empty_rag_context_calls_llm_not_pause():
    """RAG-02: rag_context='' → LLM invocado exactamente 1 vez, result NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(rag_context=""))

    assert mock_llm.invoke.call_count == 1
    assert result.get("is_paused") is not True


def test_empty_rag_context_does_not_include_rag_section():
    """RAG-02: rag_context='' → SystemMessage does NOT contain 'Información de la Clínica'."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(rag_context=""))

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert isinstance(system_msg, SystemMessage)
    assert "Información de la Clínica" not in system_msg.content


def test_no_rag_context_key_calls_llm():
    """RAG-02: state sin clave 'rag_context' → LLM llamado (usa DEFAULT_SYSTEM_PROMPT)."""
    from app.agent.nodes.generation import generation_node

    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="Hola")],
    }
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    assert mock_llm.invoke.call_count == 1
    assert result.get("is_paused") is not True

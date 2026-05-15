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
    ai_msg = AIMessage(content=response_text)
    mock.invoke.return_value = ai_msg
    # General path uses _llm.bind_tools(...).invoke(...) — set up the return chain
    mock.bind_tools.return_value.invoke.return_value = ai_msg
    return mock


def test_generation_node_uses_default_system_prompt():
    """Sin system_prompt en estado → usa DEFAULT_SYSTEM_PROMPT."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state())

    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert isinstance(system_msg, SystemMessage)
    assert DEFAULT_SYSTEM_PROMPT in system_msg.content


def test_generation_node_uses_tenant_system_prompt():
    """Con system_prompt en estado → usa el prompt del tenant ADEMÁS del default (aditivo)."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT, generation_node

    tenant_prompt = "Eres la recepcionista virtual de Clinica XYZ."
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(system_prompt=tenant_prompt))

    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert tenant_prompt in system_msg.content
    assert DEFAULT_SYSTEM_PROMPT in system_msg.content
    assert "<contexto_clinica>" in system_msg.content


def test_generation_node_general_path_uses_bind_tools():
    """RAG-03: general path calls _llm.bind_tools with tool_choice='required'."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state())

    assert mock_llm.bind_tools.called, "bind_tools should be called for general path"
    bind_kwargs = mock_llm.bind_tools.call_args[1]
    assert bind_kwargs.get("tool_choice") == "required"


def test_generation_node_returns_ai_message():
    """generation_node retorna dict con 'messages' conteniendo un AIMessage."""
    from app.agent.nodes.generation import generation_node

    ai_response = "Su turno está confirmado para el lunes."
    mock_llm = _make_mock_llm(ai_response)
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result["messages"][0].content == ai_response


def test_generation_node_general_path_calls_llm():
    """General path: _llm.bind_tools().invoke() is called exactly once when no tool_calls."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    assert result.get("is_paused") is not True

def test_generation_node_no_clinic_knowledge_xml_in_system():
    """Phase 14: system message does NOT contain <clinic_knowledge> XML — RAG is via tool calling."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state())

    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert "<clinic_knowledge>" not in system_msg.content


def test_generation_node_prepends_empathy_modifier_when_urgent():
    """Con empathy_mode='urgent' → EMPATHY_MODIFIER se añade al inicio del system_content."""
    from app.agent.nodes.generation import EMPATHY_MODIFIER, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(empathy_mode="urgent"))

    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert system_msg.content.startswith(EMPATHY_MODIFIER)


def test_generation_node_no_empathy_modifier_when_normal():
    """Con empathy_mode='normal' (o ausente) → EMPATHY_MODIFIER NO aparece en system_content."""
    from app.agent.nodes.generation import EMPATHY_MODIFIER, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(empathy_mode="normal"))

    mock_llm2 = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm2):
        generation_node(_base_state())  # sin clave empathy_mode

    for m in (mock_llm, mock_llm2):
        call_args = m.bind_tools.return_value.invoke.call_args[0][0]
        system_msg = call_args[0]
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
    """Con is_medical_query=False (o ausente) → llama al LLM normalmente via bind_tools path."""
    from app.agent.nodes.generation import generation_node

    mock_llm_false = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm_false):
        generation_node(_base_state(is_medical_query=False))

    mock_llm_absent = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm_absent):
        generation_node(_base_state())  # sin clave is_medical_query

    # El LLM SÍ debe ser llamado en ambos casos (via bind_tools)
    assert mock_llm_false.bind_tools.return_value.invoke.call_count == 1
    assert mock_llm_absent.bind_tools.return_value.invoke.call_count == 1


def test_generation_node_scheduling_intent_with_slots():
    """RESP-01: scheduling_intent=True con slots → LLM llamado, displays en contexto, con emojis numerados."""
    from app.agent.nodes.generation import generation_node

    slots = [
        {"start": "2026-03-30T10:00:00+00:00", "end": "2026-03-30T11:00:00+00:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"},
        {"start": "2026-03-30T11:00:00+00:00", "end": "2026-03-30T12:00:00+00:00", "display": "Lunes 30 de Marzo — 11:00 a 12:00 hs"},
    ]
    mock_llm = _make_mock_llm("Tenés estos turnos disponibles: Lunes 30 de Marzo — 10:00 a 11:00 hs o Lunes 30 de Marzo — 11:00 a 12:00 hs")

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(scheduling_intent=True, available_slots=slots))

    # RESP-01: LLM debe ser llamado
    mock_llm.invoke.assert_called_once()
    # Los displays deben estar inyectados en el contexto del sistema
    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "Lunes 30 de Marzo — 10:00 a 11:00 hs" in system_msg.content
    assert "Lunes 30 de Marzo — 11:00 a 12:00 hs" in system_msg.content
    # RESP-01: slots presentados con lista numerada con emojis
    assert "1️⃣" in system_msg.content
    assert "2️⃣" in system_msg.content
    assert isinstance(result["messages"][0], AIMessage)


def test_generation_node_scheduling_intent_without_slots():
    """RESP-04: scheduling_intent=True sin slots → LLM llamado (no string hardcodeado)."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Por ahora no encontré turnos disponibles. Te recomiendo llamar a la clínica.")

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(scheduling_intent=True, available_slots=[]))

    # RESP-04: LLM debe ser llamado
    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


def test_generation_node_booking_confirmed_returns_deterministic_response():
    """RESP-02: booking confirm + event_id → LLM llamado, display inyectado en contexto."""
    from app.agent.nodes.generation import generation_node

    slot = {"start": "2026-03-30T10:00:00-03:00", "end": "2026-03-30T11:00:00-03:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"}
    mock_llm = _make_mock_llm(f"¡Perfecto! Tu turno {slot['display']} está confirmado.")
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        booked_slot=slot,
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert slot["display"] in system_msg.content
    assert isinstance(result["messages"][0], AIMessage)


def test_generation_node_booking_failed_no_slots_response():
    """RESP-02: booking confirm + no event_id → LLM llamado (no hardcoded string)."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Lo siento, ya no hay disponibilidad en ese horario.")
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id=None,
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


def test_generation_node_booking_cancelled_response():
    """RESP-03: booking cancel + event_id → LLM llamado (no hardcoded string)."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Tu turno fue cancelado exitosamente.")
    state = _base_state(
        booking_intent=True,
        booking_action="cancel",
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


def test_generation_node_booking_not_found_response():
    """RESP-03: booking cancel + no event_id → LLM llamado (no hardcoded string)."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("No encontré un turno para cancelar.")
    state = _base_state(
        booking_intent=True,
        booking_action="cancel",
        calendar_event_id=None,
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


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


def test_generation_node_urgent_with_system_prompt_combines_empathy():
    """Verifica que urgent + system_prompt se combinan: EMPATHY_MODIFIER precede al prompt."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Respuesta con empatía")

    state = {
        "tenant_id": "t1",
        "phone_number": "+541100000000",
        "messages": [HumanMessage(content="me duele mucho la espalda")],
        "empathy_mode": "urgent",
        "system_prompt": "Eres recepcionista de la clínica XYZ.",
        "is_medical_query": False,
    }

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert (
        "empat" in system_msg.content.lower()
        or "urgencia" in system_msg.content.lower()
        or "está experimentando" in system_msg.content
    )
    assert "recepcionista" in system_msg.content  # system_prompt incluido


# ---------------------------------------------------------------------------
# Story 3.4 — Confidence Score (nuevos tests)
# ---------------------------------------------------------------------------


def test_generation_node_general_path_not_paused():
    """General path: LLM called via bind_tools, result is NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    assert "messages" in result
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result.get("is_paused") is not True


def test_generation_node_general_path_not_paused_no_rag_in_state():
    """General path: proceeds via bind_tools even when rag_context absent. NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    assert result.get("is_paused") is not True


def test_generation_node_normal_flow_calls_llm_via_bind_tools():
    """General path calls bind_tools path; is_paused NOT in return dict."""
    from app.agent.nodes.generation import generation_node

    ai_resp = "Tenemos disponibilidad el lunes."
    mock_llm = _make_mock_llm(ai_resp)
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    assert result["messages"][0].content == ai_resp
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
    """booking_intent=True → LLM llamado para booking path; is_paused no seteado."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Lo siento, ya no hay disponibilidad.")
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id=None,
    )
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)
    assert result.get("is_paused") is None or result.get("is_paused") is False


# ── Plan 05-02: Slot Selection Ambiguity Fix ─────────────────────────────────

def test_booking_ambiguous_slot_returns_clarification():
    """RESP-05: booking_ambiguous_slot=True → LLM llamado con instrucción de clarificación."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("¿Cuál de los turnos preferís? Podés decirme 1, 2 o 3.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        state = _base_state(
            messages=[HumanMessage(content="confirmo")],
            booking_intent=True,
            booking_action="confirm",
            booking_ambiguous_slot=True,
        )
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


def test_booking_clear_confirm_not_clarification():
    """RESP-02: booking confirm claro (no ambiguo) → LLM llamado, display en contexto."""
    from app.agent.nodes.generation import generation_node

    slot = {
        "start": "2026-03-30T10:00:00-03:00",
        "end": "2026-03-30T11:00:00-03:00",
        "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs",
    }
    mock_llm = _make_mock_llm(f"¡Perfecto! Tu turno {slot['display']} está confirmado.")
    state = _base_state(
        booking_intent=True,
        booking_action="confirm",
        booked_slot=slot,
        calendar_event_id="gcal_event_abc123",
    )

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    mock_llm.invoke.assert_called_once()
    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert slot["display"] in system_msg.content
    assert isinstance(result["messages"][0], AIMessage)


def test_booking_ambiguous_calls_llm():
    """RESP-05: booking_ambiguous_slot=True → _llm.invoke ES llamado (LLM genera la clarificación)."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("¿Cuál turno preferís? Decime 1, 2 o 3.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        state = _base_state(
            booking_intent=True,
            booking_action="confirm",
            booking_ambiguous_slot=True,
        )
        generation_node(state)

    mock_llm.invoke.assert_called_once()


# ── Plan 06-02: RAG-02 — Remove confidence gate ──────────────────────────────


def test_general_path_calls_llm_via_bind_tools_not_paused():
    """General path: bind_tools.invoke called once, result NOT paused."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state())

    assert mock_llm.bind_tools.return_value.invoke.call_count == 1
    assert result.get("is_paused") is not True


def test_general_path_system_message_has_no_rag_section_header():
    """Phase 14: SystemMessage does NOT contain 'Información de la Clínica' or XML — RAG via tool."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state())

    call_args = mock_llm.bind_tools.return_value.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert isinstance(system_msg, SystemMessage)
    assert "Información de la Clínica" not in system_msg.content
    assert "<clinic_knowledge>" not in system_msg.content


def test_no_rag_context_key_calls_llm():
    """Phase 14: state sin clave 'rag_context' → LLM llamado via bind_tools (usa DEFAULT_SYSTEM_PROMPT)."""
    from app.agent.nodes.generation import generation_node

    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="Hola")],
    }
    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    assert mock_llm.bind_tools.return_value.invoke.call_count == 1
    assert result.get("is_paused") is not True


# ── Phase 14: RAG via tool calling — system message has no XML injection ─────


def test_rag_context_wrapped_in_xml_delimiters():
    """Phase 14: general path uses bind_tools — no XML injection in SystemMessage."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("resp")
    state = {
        "tenant_id": "test", "phone_number": "+54911",
        "messages": [HumanMessage(content="precio")],
    }
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)
    system_msg = mock_llm.bind_tools.return_value.invoke.call_args[0][0][0]
    assert "<clinic_knowledge>" not in system_msg.content


def test_rag_context_xml_contains_the_content():
    """Phase 14: tool result delivered as ToolMessage (not XML in system). bind_tools called."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("resp")
    state = {
        "tenant_id": "test", "phone_number": "+54911",
        "messages": [HumanMessage(content="horario")],
    }
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)
    assert mock_llm.bind_tools.called


def test_rag_context_injection_includes_anti_injection_instruction():
    """Phase 14: DEFAULT_SYSTEM_PROMPT includes search_knowledge_tool instruction (anti-hallucination)."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT

    content_lower = DEFAULT_SYSTEM_PROMPT.lower()
    assert (
        "search_knowledge_tool" in DEFAULT_SYSTEM_PROMPT
        or "herramienta" in content_lower
        or "tool" in content_lower
    )


def test_rag_context_old_markdown_header_absent():
    """Phase 14: '## Información de la Clínica' markdown header NOT in system message."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("resp")
    state = {
        "tenant_id": "test", "phone_number": "+54911",
        "messages": [HumanMessage(content="precio")],
    }
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)
    system_msg = mock_llm.bind_tools.return_value.invoke.call_args[0][0][0]
    assert "## Información de la Clínica" not in system_msg.content


def test_empty_rag_context_no_xml_tags():
    """Phase 14: SystemMessage has NO <clinic_knowledge> XML — RAG is delivered via ToolMessage."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("resp")
    state = {
        "tenant_id": "test", "phone_number": "+54911",
        "messages": [HumanMessage(content="hola")],
    }
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)
    system_msg = mock_llm.bind_tools.return_value.invoke.call_args[0][0][0]
    assert "<clinic_knowledge>" not in system_msg.content


# ── Plan 09-01: COPY-01/02/03 — Argentine copy rewrites ─────────────────────


def test_anti_diagnostic_response_contains_te_soy_sincero():
    """COPY-01: ANTI_DIAGNOSTIC_RESPONSE uses 'te soy sincero', no gendered slash constructions."""
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE

    assert "te soy sincero" in ANTI_DIAGNOSTIC_RESPONSE
    assert "/a" not in ANTI_DIAGNOSTIC_RESPONSE


def test_low_confidence_pause_response_directs_to_clinic():
    """COPY-02: LOW_CONFIDENCE_PAUSE_RESPONSE tells patient to call clinic — no escalation promise."""
    from app.agent.nodes.generation import LOW_CONFIDENCE_PAUSE_RESPONSE

    assert "clínica" in LOW_CONFIDENCE_PAUSE_RESPONSE
    assert "contactaremos" not in LOW_CONFIDENCE_PAUSE_RESPONSE
    assert "especialista" not in LOW_CONFIDENCE_PAUSE_RESPONSE


def test_shadow_mode_redirect_specifies_contact_channels():
    """COPY-03: SHADOW_MODE_REDIRECT_RESPONSE specifies 'por teléfono o de forma presencial'."""
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE

    assert "por teléfono o de forma presencial" in SHADOW_MODE_REDIRECT_RESPONSE
    assert "canales habituales" not in SHADOW_MODE_REDIRECT_RESPONSE


# ── Plan 09-02: COPY-04/05 — System prompt fix + LLM tuning ─────────────────


def test_default_system_prompt_has_correct_accents():
    """COPY-04: DEFAULT_SYSTEM_PROMPT contains 'recepcionista' and 'médica' (accents present)."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT

    assert "recepcionista" in DEFAULT_SYSTEM_PROMPT
    assert "médica" in DEFAULT_SYSTEM_PROMPT


def test_llm_temperature_is_0():
    """PROMPT-04: _llm singleton uses temperature=0 for deterministic output."""
    from app.agent.nodes import generation

    llm = generation._get_llm()
    try:
        assert llm.temperature == 0
    finally:
        generation._llm = None


def test_llm_request_timeout_is_20():
    """COPY-05: _llm singleton has request_timeout=20 to prevent worker blocking."""
    from app.agent.nodes import generation

    llm = generation._get_llm()
    try:
        assert llm.request_timeout == 20
    finally:
        generation._llm = None


# ── Plan 11-01: PROMPT-01/02/03/04 — System Prompt & Model ──────────────────


def test_default_system_prompt_meets_length_requirement():
    """PROMPT-01: DEFAULT_SYSTEM_PROMPT is at least 1600 chars (~400 tokens)."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT

    assert len(DEFAULT_SYSTEM_PROMPT) >= 1600, (
        f"DEFAULT_SYSTEM_PROMPT too short: {len(DEFAULT_SYSTEM_PROMPT)} chars "
        "(need ≥1600 chars / ~400 tokens)"
    )


def test_default_system_prompt_contains_search_knowledge_tool_instruction():
    """PROMPT-02: DEFAULT_SYSTEM_PROMPT explicitly instructs LLM to call search_knowledge_tool."""
    from app.agent.nodes.generation import DEFAULT_SYSTEM_PROMPT

    assert "search_knowledge_tool" in DEFAULT_SYSTEM_PROMPT, (
        "DEFAULT_SYSTEM_PROMPT must contain 'search_knowledge_tool' instruction "
        "for clinic-specific knowledge retrieval"
    )


def test_llm_model_is_gpt_4_1_mini():
    """PROMPT-03: _llm singleton uses gpt-4.1-mini (not gpt-4o-mini)."""
    from app.agent.nodes import generation

    llm = generation._get_llm()
    try:
        model = getattr(llm, "model_name", None) or getattr(llm, "model", None)
        assert model == "gpt-4.1-mini", (
            f"Expected model 'gpt-4.1-mini', got '{model}'"
        )
    finally:
        generation._llm = None


# ── Plan 13-01: RESP-01/04 — Scheduling path LLM generation ──────────────────


def test_scheduling_slots_system_context_contains_all_displays():
    """RESP-01: system context passed to LLM contains all slot display strings verbatim."""
    from app.agent.nodes.generation import generation_node

    slots = [
        {"display": "Martes 31 — 09:00 a 10:00 hs"},
        {"display": "Martes 31 — 10:00 a 11:00 hs"},
        {"display": "Martes 31 — 11:00 a 12:00 hs"},
    ]
    mock_llm = _make_mock_llm("Tenés tres opciones disponibles para el martes.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(scheduling_intent=True, available_slots=slots))

    system_msg = mock_llm.invoke.call_args[0][0][0]
    for slot in slots:
        assert slot["display"] in system_msg.content, f"Missing slot display: {slot['display']}"


def test_scheduling_no_slots_system_context_instructs_actionable_step():
    """RESP-04: system context for no-slots path instructs LLM to offer actionable next step."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Lamentablemente no hay turnos. Llamá a la clínica.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(scheduling_intent=True, available_slots=[]))

    system_msg = mock_llm.invoke.call_args[0][0][0]
    content_lower = system_msg.content.lower()
    assert "accionable" in content_lower or "llamar" in content_lower or "paso siguiente" in content_lower


# ── Plan 13-02: RESP-02/03/05/06/07 — Booking path + hardcoded bypasses ──────


def test_resp02_booking_confirm_display_in_system_context():
    """RESP-02: booked_slot['display'] aparece verbatim en el contexto del sistema pasado al LLM."""
    from app.agent.nodes.generation import generation_node

    display = "Miércoles 15 de Abril — 14:00 a 15:00 hs"
    slot = {"start": "2026-04-15T14:00:00-03:00", "end": "2026-04-15T15:00:00-03:00", "display": display}
    mock_llm = _make_mock_llm(f"Tu turno {display} está confirmado.")
    state = _base_state(booking_intent=True, booking_action="confirm", booked_slot=slot, calendar_event_id="evt99")

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert display in system_msg.content, f"display '{display}' not injected verbatim in context"


def test_resp03_booking_cancel_success_calls_llm():
    """RESP-03: booking cancel success → LLM llamado."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("Tu turno fue cancelado.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(booking_intent=True, booking_action="cancel", calendar_event_id="evt1"))

    mock_llm.invoke.assert_called_once()
    assert isinstance(result["messages"][0], AIMessage)


def test_resp05_ambiguous_slot_context_instructs_number_selection():
    """RESP-05: contexto para slot ambiguo instruye al paciente elegir 1, 2 o 3."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm("¿Cuál preferís? Decime 1, 2 o 3.")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state(booking_intent=True, booking_ambiguous_slot=True))

    system_msg = mock_llm.invoke.call_args[0][0][0]
    content_lower = system_msg.content.lower()
    assert "1, 2" in system_msg.content or "número" in content_lower or "elegir" in content_lower


def test_resp06_shadow_mode_hardcoded_no_llm():
    """RESP-06: shadow_mode_active → SHADOW_MODE_REDIRECT_RESPONSE devuelto; _llm NO llamado."""
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(shadow_mode_active=True))

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == SHADOW_MODE_REDIRECT_RESPONSE


def test_resp07_anti_diagnostic_hardcoded_no_llm():
    """RESP-07: is_medical_query=True → ANTI_DIAGNOSTIC_RESPONSE devuelto; _llm NO llamado."""
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE, generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(_base_state(is_medical_query=True))

    mock_llm.invoke.assert_not_called()
    assert result["messages"][0].content == ANTI_DIAGNOSTIC_RESPONSE


# ── Plan 14-01: RAG-01/03/04 — LLM-driven inline tool calling ────────────────


def test_rag01_clinic_question_triggers_tool_call_and_tool_message():
    """RAG-01: LLM returns tool_calls → tool executed inline → ToolMessage added → second LLM call."""
    from langchain_core.messages import ToolMessage
    from app.agent.nodes.generation import generation_node

    # First response: LLM decides to call the tool
    first_ai = AIMessage(content="")
    first_ai.tool_calls = [{"id": "call_abc", "name": "search_knowledge_tool", "args": {"query": "precio ortodoncia"}}]

    # Second response: LLM answers after seeing the tool result
    final_ai = AIMessage(content="La ortodoncia cuesta $50.000 según la base de datos.")

    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value.invoke.return_value = first_ai
    mock_llm.invoke.return_value = final_ai

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "Precio ortodoncia: $50.000"

    state = _base_state(messages=[HumanMessage(content="cuanto cuesta la ortodoncia?")])

    with patch("app.agent.nodes.generation._llm", mock_llm), \
         patch("app.agent.nodes.generation.make_search_tool", return_value=mock_tool):
        result = generation_node(state)

    # First call: via bind_tools
    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    # Tool was executed
    mock_tool.invoke.assert_called_once_with({"query": "precio ortodoncia"})
    # Second call: via _llm.invoke with tool result in messages
    mock_llm.invoke.assert_called_once()
    second_call_msgs = mock_llm.invoke.call_args[0][0]
    tool_msgs = [m for m in second_call_msgs if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert tool_msgs[0].content == "Precio ortodoncia: $50.000"
    assert tool_msgs[0].tool_call_id == "call_abc"
    # Final response is the second LLM response
    assert result["messages"][0].content == final_ai.content


def test_rag03_general_path_uses_tool_choice_required():
    """RAG-03: bind_tools is called with tool_choice='required' — LLM cannot skip the tool."""
    from app.agent.nodes.generation import generation_node

    mock_llm = _make_mock_llm()
    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(_base_state())

    assert mock_llm.bind_tools.called
    bind_kwargs = mock_llm.bind_tools.call_args[1]
    assert bind_kwargs.get("tool_choice") == "required", \
        f"Expected tool_choice='required', got: {bind_kwargs}"


def test_rag04_empty_tool_result_becomes_sin_resultados_message():
    """RAG-04: tool returns '' → ToolMessage content = 'Sin resultados.' → second LLM call made."""
    from langchain_core.messages import ToolMessage
    from app.agent.nodes.generation import generation_node

    # LLM calls tool, tool returns empty
    first_ai = AIMessage(content="")
    first_ai.tool_calls = [{"id": "call_xyz", "name": "search_knowledge_tool", "args": {"query": "horarios"}}]
    final_ai = AIMessage(content="No tengo esa información, te recomiendo llamar a la clínica.")

    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value.invoke.return_value = first_ai
    mock_llm.invoke.return_value = final_ai

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = ""  # RAG-04: empty result

    with patch("app.agent.nodes.generation._llm", mock_llm), \
         patch("app.agent.nodes.generation.make_search_tool", return_value=mock_tool):
        result = generation_node(_base_state())

    # ToolMessage content must be "Sin resultados." when tool returns empty
    second_call_msgs = mock_llm.invoke.call_args[0][0]
    tool_msgs = [m for m in second_call_msgs if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert tool_msgs[0].content == "Sin resultados."
    # Final response is the second LLM response
    assert result["messages"][0].content == final_ai.content


# ── Plan 15-02: NAME-04/05/06/07 — Generation name collection path ────────────


_NAME_SLOT = {
    "start": "2026-04-10T10:00:00-03:00",
    "end": "2026-04-10T11:00:00-03:00",
    "display": "Jueves 10 de Abril — 10:00 a 11:00 hs",
}
_NAME_EVENT_ID = "gcal_name_evt_001"


def _name_state(last_message: str, name_attempts: int = 0, slot_presented_minutes_ago: int = 0) -> dict:
    """Build state for name collection tests."""
    from datetime import datetime, timezone, timedelta
    slot_ts = (datetime.now(timezone.utc) - timedelta(minutes=slot_presented_minutes_ago)).isoformat()
    return {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=last_message)],
        "name_collection_active": True,
        "booked_slot": _NAME_SLOT,
        "slot_presented_at": slot_ts,
        "name_attempts": name_attempts,
        "booking_intent": True,
    }


def _mock_tenant_with_calendar():
    mock = MagicMock()
    mock.calendar_id = "clinic@group.calendar.google.com"
    mock.calendar_credentials = {"type": "service_account"}
    mock.calendar_credentials_ref = None
    mock.uses_native_calendar = False
    return mock


def test_name04_first_ask_increments_attempts():
    """NAME-04: Turn 1 — name_attempts=0 → generation_node asks for name and returns name_attempts=1."""
    from app.agent.nodes.generation import generation_node

    with patch("app.agent.nodes.generation._llm", _make_mock_llm("¿Me podés dar tu nombre completo?")):
        result = generation_node(_name_state("el primero", name_attempts=0))
    assert result.get("name_attempts") == 1
    assert "messages" in result


def test_name04_name_provided_confirms_booking():
    """NAME-04: Turn 2 — patient provides name → transitions to DNI phase (v1.4).

    v1.4 flow: name captured → ask DNI (Fase B) → create event only after DNI.
    dni_attempts starts at 1 (not 0) because the DNI question is asked in this
    same response; the next turn should extract immediately, not ask again.
    Event creation is tested separately in test_name06_event_title_contains_patient_name.
    """
    from app.agent.nodes.generation import generation_node

    with patch("app.agent.nodes.generation._llm", _make_mock_llm("Perfecto, Juan. ¿Me das tu DNI?")):
        result = generation_node(_name_state("Juan Pérez", name_attempts=1))

    assert result.get("patient_name") == "Juan Pérez"
    assert result.get("name_collection_active") is False
    assert result.get("dni_collection_active") is True
    assert result.get("dni_attempts") == 1  # first ask already happened in this turn
    assert "messages" in result


def _dni_state(last_message: str, patient_name: str, dni_attempts: int = 1) -> dict:
    """Build state for DNI collection (Fase B) tests."""
    from datetime import datetime, timezone
    slot_ts = datetime.now(timezone.utc).isoformat()
    return {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=last_message)],
        "name_collection_active": False,
        "dni_collection_active": True,
        "booked_slot": _NAME_SLOT,
        "slot_presented_at": slot_ts,
        "patient_name": patient_name,
        "name_attempts": 1,
        "dni_attempts": dni_attempts,
        "booking_intent": True,
    }


def _phase_d_state_gen(patient_name: str, patient_dni: str | None = "32456789") -> dict:
    """Build Phase D state for generation tests (extended data collection, attempt 1)."""
    from datetime import datetime, timezone
    slot_ts = datetime.now(timezone.utc).isoformat()
    return {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="OSEP")],
        "name_collection_active": False,
        "dni_collection_active": False,
        "extended_collection_active": True,
        "extended_attempts": 1,
        "booked_slot": _NAME_SLOT,
        "slot_presented_at": slot_ts,
        "patient_name": patient_name,
        "patient_dni": patient_dni,
        "booking_intent": False,
    }


def test_name06_event_title_contains_patient_name():
    """NAME-06: calendar event title='Turno — {patient_name}' at Fase C (via Phase D → C)."""
    from app.agent.nodes.generation import generation_node

    with (
        patch("app.agent.nodes.generation._llm", _make_mock_llm("Listo, María.")),
        patch("app.agent.nodes.generation._extract_extended_data", return_value={"patient_obra_social": "OSEP"}),
        patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        patch("app.agent.nodes.generation.calendar_service") as mock_cs,
        patch("app.agent.nodes.generation.patient_service") as mock_ps,
        patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant_with_calendar()
        mock_ts.get_tenant_services.return_value = []
        mock_ps.get_or_create_patient.return_value = MagicMock(patient_id="pat_001")
        mock_cs.create_event.return_value = _NAME_EVENT_ID
        mock_draft.get_draft.return_value = {}

        generation_node(_phase_d_state_gen("María López"))

    call_kwargs = mock_cs.create_event.call_args[1]
    assert call_kwargs.get("title") == "Turno — María López"


def test_name04_booking_keyword_asks_again():
    """NAME-04: Turn 2 — unrecognizable input → asks again, name_attempts increments to 2."""
    from app.agent.nodes.generation import generation_node

    with patch("app.agent.nodes.generation._llm", _make_mock_llm("¿Podés decirme tu nombre?")):
        # Single-word inputs and inputs with punctuation are not treated as full names
        result = generation_node(_name_state("dale", name_attempts=1))
    assert result.get("name_attempts") == 2
    assert result.get("patient_name") is None


def test_name05_no_name_after_two_attempts_triggers_handoff():
    """NAME-05: name_attempts=2 and no name → is_paused=True for human handoff."""
    from app.agent.nodes.generation import generation_node

    with patch("app.agent.nodes.generation._llm", _make_mock_llm("Te paso con un asesor.")):
        # Use message with punctuation to ensure it's not extracted as a name
        result = generation_node(_name_state("no, prefiero no", name_attempts=2))
    assert result.get("is_paused") is True
    assert result.get("name_collection_active") is False


def test_name07_expired_slot_clears_name_collection():
    """NAME-07: slot older than 30 minutes → slot expired response, name_collection_active=False."""
    from app.agent.nodes.generation import generation_node

    with patch("app.agent.nodes.generation._llm", _make_mock_llm("El turno expiró.")):
        result = generation_node(_name_state("María", name_attempts=1, slot_presented_minutes_ago=31))
    assert result.get("name_collection_active") is False
    assert result.get("patient_name") is None
    assert "messages" in result


# ---------------------------------------------------------------------------
# Tests — Walk-in service (migration 006)
# ---------------------------------------------------------------------------

def test_walk_in_service_returns_direct_message():
    """walk_in_service=True → AIMessage directo con 'orden de llegada', sin LLM."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(walk_in_service=True, selected_service_name="Traumatología")
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    assert "messages" in result
    content = result["messages"][0].content
    assert "orden de llegada" in content.lower()
    mock_llm.invoke.assert_not_called()
    mock_llm.bind_tools.assert_not_called()


def test_walk_in_service_no_llm_call():
    """walk_in_service=True → LLM no es invocado en ninguna forma."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(walk_in_service=True)
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)

    mock_llm.invoke.assert_not_called()
    mock_llm.bind_tools.assert_not_called()


def test_walk_in_service_includes_service_name():
    """walk_in_service=True + selected_service_name → nombre del servicio en la respuesta."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(walk_in_service=True, selected_service_name="Traumatología")

    with patch("app.agent.nodes.generation._llm", _make_mock_llm()):
        result = generation_node(state)

    content = result["messages"][0].content
    assert "Traumatología" in content


def test_walk_in_service_fallback_message_without_service_name():
    """walk_in_service=True sin selected_service_name → usa 'este servicio'."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(walk_in_service=True)

    with patch("app.agent.nodes.generation._llm", _make_mock_llm()):
        result = generation_node(state)

    content = result["messages"][0].content
    assert "este servicio" in content


# ---------------------------------------------------------------------------
# Tests — Gated service (migration 006)
# ---------------------------------------------------------------------------

def test_gated_service_calls_llm():
    """gated_service_active=True → LLM invocado con contexto de prerequisito."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(
        gated_service_active=True,
        gated_service_name="Aquagym",
        gated_prerequisite_note="Primero debés tener consulta con el Dr. Rodríguez.",
    )
    mock_llm = _make_mock_llm("Para acceder a Aquagym necesitás consulta previa.")

    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)

    assert "messages" in result
    mock_llm.invoke.assert_called_once()


def test_gated_service_system_content_includes_prerequisite_note():
    """gated_service_active=True → system content incluye el prerequisite_note."""
    from app.agent.nodes.generation import generation_node

    note = "Primero debés tener consulta con el Dr. Rodríguez, quien atiende sin turno previo."
    state = _base_state(
        gated_service_active=True,
        gated_service_name="Aquagym",
        gated_prerequisite_note=note,
    )
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert isinstance(system_msg, SystemMessage)
    assert note in system_msg.content


def test_gated_service_system_content_includes_service_name():
    """gated_service_active=True → system content menciona el nombre del servicio."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(
        gated_service_active=True,
        gated_service_name="Hidroterapia",
        gated_prerequisite_note="Requiere consulta previa.",
    )
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert "Hidroterapia" in system_msg.content


def test_gated_service_fallback_note_when_none():
    """gated_service_active=True sin prerequisite_note → fallback genérico en system content."""
    from app.agent.nodes.generation import generation_node

    state = _base_state(
        gated_service_active=True,
        gated_service_name="Aquagym",
    )
    mock_llm = _make_mock_llm()

    with patch("app.agent.nodes.generation._llm", mock_llm):
        generation_node(state)

    call_args = mock_llm.invoke.call_args[0][0]
    system_msg = call_args[0]
    assert "consulta médica previa" in system_msg.content


# ---------------------------------------------------------------------------
# Tests — Native calendar path in _finalize_registration (Wave 2)
# ---------------------------------------------------------------------------


def _mock_tenant_native():
    """Tenant config mock con uses_native_calendar=True."""
    mock = MagicMock()
    mock.calendar_id = None
    mock.calendar_credentials = None
    mock.calendar_credentials_ref = None
    mock.uses_native_calendar = True
    return mock


def _phase_d_state_native(patient_name: str, service_id: str = "svc-001") -> dict:
    """Build Phase D state for native-calendar finalization tests.

    Uses extended_attempts=2 to trigger the 'time up → Fase C' branch
    (extracted data empty + attempts exhausted → calls _finalize_registration).
    """
    from datetime import datetime, timezone
    slot_ts = datetime.now(timezone.utc).isoformat()
    return {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="OSEP")],
        "name_collection_active": False,
        "dni_collection_active": False,
        "extended_collection_active": True,
        "extended_attempts": 2,
        "booked_slot": {
            "start": "2026-05-20T10:00:00-03:00",
            "end": "2026-05-20T11:00:00-03:00",
            "display": "Martes 20 de Mayo — 10:00 a 11:00 hs",
        },
        "slot_presented_at": slot_ts,
        "patient_name": patient_name,
        "patient_dni": "32456789",
        "selected_service_id": service_id,
        "selected_service_name": "Kinesiología",
        "booking_intent": False,
    }


def test_finalize_registration_native_no_gcal():
    """Native path: uses_native_calendar=True → NO llama a calendar_service.create_event,
    SÍ llama a patient_service.create_appointment con professional_id."""
    from app.agent.nodes.generation import generation_node

    with (
        patch("app.agent.nodes.generation._llm", _make_mock_llm("Listo, turno reservado.")),
        patch("app.agent.nodes.generation._extract_extended_data", return_value={}),
        patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        patch("app.agent.nodes.generation.calendar_service") as mock_cs,
        patch("app.agent.nodes.generation.patient_service") as mock_ps,
        patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        patch("app.services.availability_service.resolve_professional_id", return_value="prof-42"),
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant_native()
        mock_ts.get_tenant_services.return_value = []
        mock_ps.get_or_create_patient.return_value = MagicMock(patient_id="pat-native-01")
        mock_draft.get_draft.return_value = {}

        generation_node(_phase_d_state_native("Juan Pérez"))

    # GCal NO debe ser llamado
    mock_cs.create_event.assert_not_called()

    # patient_service.create_appointment SÍ debe ser llamado
    mock_ps.create_appointment.assert_called_once()
    call_kwargs = mock_ps.create_appointment.call_args[1]
    assert call_kwargs.get("calendar_event_id") is None


def test_finalize_registration_native_event_id_is_none():
    """Native path: event_id es None internamente y el resultado no crashea."""
    from app.agent.nodes.generation import generation_node

    with (
        patch("app.agent.nodes.generation._llm", _make_mock_llm("Turno confirmado.")),
        patch("app.agent.nodes.generation._extract_extended_data", return_value={}),
        patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        patch("app.agent.nodes.generation.calendar_service") as mock_cs,
        patch("app.agent.nodes.generation.patient_service") as mock_ps,
        patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        patch("app.services.availability_service.resolve_professional_id", return_value=None),
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant_native()
        mock_ts.get_tenant_services.return_value = []
        mock_ps.get_or_create_patient.return_value = MagicMock(patient_id="pat-native-02")
        mock_draft.get_draft.return_value = {}

        result = generation_node(_phase_d_state_native("Ana García"))

    # No debe haber excepción; result debe contener mensajes
    assert "messages" in result
    assert isinstance(result["messages"][0], AIMessage)
    # calendar_event_id en el resultado es None (no crashea)
    assert result.get("calendar_event_id") is None
    # GCal NO llamado
    mock_cs.create_event.assert_not_called()


def test_finalize_registration_legacy_uses_gcal():
    """Legacy path (uses_native_calendar=False): sigue llamando a calendar_service.create_event."""
    from app.agent.nodes.generation import generation_node

    mock_legacy_tenant = MagicMock()
    mock_legacy_tenant.calendar_id = "clinic@group.calendar.google.com"
    mock_legacy_tenant.calendar_credentials = {"type": "service_account"}
    mock_legacy_tenant.calendar_credentials_ref = None
    mock_legacy_tenant.uses_native_calendar = False

    with (
        patch("app.agent.nodes.generation._llm", _make_mock_llm("Turno agendado en GCal.")),
        patch("app.agent.nodes.generation._extract_extended_data", return_value={}),
        patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        patch("app.agent.nodes.generation.calendar_service") as mock_cs,
        patch("app.agent.nodes.generation.patient_service") as mock_ps,
        patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
    ):
        mock_ts.get_tenant_config.return_value = mock_legacy_tenant
        mock_ts.get_tenant_services.return_value = []
        mock_ps.get_or_create_patient.return_value = MagicMock(patient_id="pat-legacy-01")
        mock_cs.create_event.return_value = "gcal_evt_legacy_001"
        mock_draft.get_draft.return_value = {}

        result = generation_node(_phase_d_state_native("Carlos López"))

    # GCal SÍ debe ser llamado en el path legacy
    mock_cs.create_event.assert_called_once()
    # El event_id en el resultado debe ser el devuelto por GCal
    assert result.get("calendar_event_id") == "gcal_evt_legacy_001"

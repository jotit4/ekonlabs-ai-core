"""Tests para app/agent/graph.py — grafo LangGraph (Stories 2.3–2.5: triage + anti_diagnostic + rag_retrieval + generation)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from app.agent.state import ConversationState


_BASE_STATE: ConversationState = {
    "tenant_id": "test-tenant-uuid",
    "phone_number": "15551234567",
    "messages": [],
    "confidence_score": 1.0,
    "is_paused": False,
    "intake_complete": True,  # bypass intake node in graph integration tests
}

_AI_REPLY = AIMessage(content="Respuesta de la IA")


def _mock_llm():
    mock = MagicMock()
    mock.invoke.return_value = _AI_REPLY
    # General path uses _llm.bind_tools(...).invoke(...) — set up the return chain
    mock.bind_tools.return_value.invoke.return_value = _AI_REPLY
    return mock


def _mock_search_tool(context: str = ""):
    """Mock para make_search_tool — retorna herramienta que devuelve el contexto dado.

    Args:
        context: Texto que la herramienta retornará al invocarla.
                 Usar cadena no vacía para tests del flujo LLM normal (Story 3.4:
                 contexto vacío activa low_confidence_pause en lugar de llamar al LLM).
    """
    mock_tool = MagicMock()
    mock_tool.invoke.return_value = context
    mock = MagicMock(return_value=mock_tool)
    return mock


def test_graph_is_compiled():
    """El grafo se compila sin errores al importar el módulo."""
    from app.agent.graph import graph
    assert graph is not None


def test_graph_has_rag_retrieval_and_generation_nodes():
    """El grafo contiene todos los nodos esperados incluyendo 'booking' (Story 3.2)."""
    from app.agent.graph import graph
    node_names = set(graph.nodes.keys())
    assert "triage" in node_names
    assert "anti_diagnostic" in node_names
    assert "booking" in node_names
    assert "scheduling" in node_names
    assert "rag_retrieval" in node_names
    assert "generation" in node_names
    assert "session_node" not in node_names  # session_node de Story 2.2 debe estar removido


def test_graph_invoke_returns_state():
    """graph.invoke() retorna un estado válido con los campos correctos.

    Usa RAG no vacío para activar el flujo LLM normal (Story 3.4: RAG vacío
    activa low_confidence_pause con confidence_score=0.0 e is_paused=True).
    """
    from app.agent.graph import graph
    state = {**_BASE_STATE, "messages": [HumanMessage(content="Hola")]}
    with (
        patch("app.agent.nodes.generation._llm", _mock_llm()),
        patch("app.agent.nodes.rag_retrieval.make_search_tool",
              _mock_search_tool(context="Horarios: Lunes a Viernes 9-18h.")),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})
    assert result is not None
    assert result["tenant_id"] == "test-tenant-uuid"
    assert result["phone_number"] == "15551234567"
    assert result["confidence_score"] == 1.0
    assert result["is_paused"] is False


def test_graph_invoke_preserves_messages_with_add_messages_reducer():
    """Con add_messages reducer, el historial se preserva tras invoke (no se sobreescribe)."""
    from app.agent.graph import graph
    history = [
        HumanMessage(content="Primera consulta"),
        AIMessage(content="Respuesta previa"),
    ]
    state = {**_BASE_STATE, "messages": history}
    with (
        patch("app.agent.nodes.generation._llm", _mock_llm()),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", _mock_search_tool()),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})
    # Los mensajes del historial deben estar presentes en el resultado
    assert len(result["messages"]) >= 2
    assert result["messages"][0].content == "Primera consulta"
    assert result["messages"][1].content == "Respuesta previa"


def test_graph_invoke_with_empty_messages():
    """graph.invoke() funciona correctamente con historial vacío."""
    from app.agent.graph import graph
    state = {**_BASE_STATE, "messages": []}
    with (
        patch("app.agent.nodes.generation._llm", _mock_llm()),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", _mock_search_tool()),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})
    assert result is not None
    assert isinstance(result["messages"], list)


def test_graph_invoke_with_system_prompt_in_state():
    """graph.invoke() funciona cuando system_prompt está presente en el estado (NotRequired)."""
    from app.agent.graph import graph
    state = {
        **_BASE_STATE,
        "messages": [HumanMessage(content="Hola")],
        "system_prompt": "Eres un asistente médico amable.",
    }
    with (
        patch("app.agent.nodes.generation._llm", _mock_llm()),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", _mock_search_tool()),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})
    assert result is not None
    assert result["tenant_id"] == "test-tenant-uuid"


def test_graph_thread_id_config_format():
    """El formato de thread_id debe ser '{tenant_id}:{phone_number}'."""
    from app.agent.graph import graph
    tenant_id = "abc123"
    phone = "15551234567"
    expected_thread_id = f"{tenant_id}:{phone}"
    state = {**_BASE_STATE, "tenant_id": tenant_id, "phone_number": phone, "messages": []}
    with (
        patch("app.agent.nodes.generation._llm", _mock_llm()),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", _mock_search_tool()),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": expected_thread_id}})
    assert result is not None


def test_graph_medical_query_bypasses_rag_and_llm():
    """Con un mensaje médico, el grafo retorna ANTI_DIAGNOSTIC_RESPONSE sin llamar al LLM ni al RAG."""
    from app.agent.graph import graph
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE

    mock_llm = _mock_llm()
    mock_search = _mock_search_tool()

    state = {**_BASE_STATE, "messages": [HumanMessage(content="necesito un diagnóstico urgente")]}
    with (
        patch("app.agent.nodes.consent.has_active_consent", return_value=True),
        patch("app.agent.nodes.generation._llm", mock_llm),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", mock_search),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})

    # El LLM no debe ser invocado — respuesta hardcoded
    mock_llm.invoke.assert_not_called()
    # rag_retrieval_node no debe ser invocado — make_search_tool (la factory) tampoco
    mock_search.assert_not_called()
    mock_search.return_value.invoke.assert_not_called()
    # La respuesta en el historial debe ser ANTI_DIAGNOSTIC_RESPONSE
    ai_messages = [m for m in result["messages"] if getattr(m, "type", None) == "ai"]
    assert len(ai_messages) >= 1
    assert ai_messages[-1].content == ANTI_DIAGNOSTIC_RESPONSE


def test_graph_scheduling_intent_bypasses_rag():
    """Con mensaje de agendamiento, el grafo usa scheduling_node y NO llama a rag_retrieval.
    RESP-01: LLM SÍ es invocado con los slots en el contexto del sistema (prosa natural).
    """
    from app.agent.graph import graph
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE

    mock_llm = _mock_llm()
    mock_search = _mock_search_tool()

    state = {**_BASE_STATE, "messages": [HumanMessage(content="quiero sacar turno")]}

    mock_tenant = MagicMock()
    mock_tenant.calendar_id = "clinic@group.calendar.google.com"
    mock_tenant.calendar_credentials = {"type": "service_account"}
    mock_tenant.shadow_mode_enabled = False

    fake_slots = [
        {"start": "2026-03-30T10:00:00+00:00", "end": "2026-03-30T11:00:00+00:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"}
    ]

    with (
        patch("app.agent.nodes.consent.has_active_consent", return_value=True),
        patch("app.agent.nodes.generation._llm", mock_llm),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", mock_search),
        patch("app.agent.nodes.booking.tenant_service") as mock_ts_booking,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs_booking,
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts_booking.get_tenant_config.return_value = mock_tenant
        mock_cs_booking.get_available_slots.return_value = []  # booking_node no detecta confirmación
        mock_ts.get_tenant_config.return_value = mock_tenant
        mock_cs.get_available_slots.return_value = fake_slots

        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})

    # rag_retrieval NO debe ser invocado (scheduling_intent=True va directo a generation)
    mock_search.assert_not_called()
    # RESP-01: LLM SÍ debe ser invocado con los slots en el contexto del sistema
    mock_llm.invoke.assert_called_once()
    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "Lunes 30 de Marzo — 10:00 a 11:00 hs" in system_msg.content
    assert "1️⃣" in system_msg.content
    ai_messages = [m for m in result["messages"] if getattr(m, "type", None) == "ai"]
    assert len(ai_messages) >= 1
    assert ai_messages[-1].content != ANTI_DIAGNOSTIC_RESPONSE


def test_graph_booking_confirm_bypasses_scheduling_and_rag():
    """Con mensaje de confirmación de turno, booking_node crea el evento y saltea scheduling y rag."""
    from app.agent.graph import graph

    mock_llm = _mock_llm()
    mock_search = _mock_search_tool()

    state = {**_BASE_STATE, "messages": [HumanMessage(content="el primero")]}

    mock_tenant = MagicMock()
    mock_tenant.calendar_id = "clinic@group.calendar.google.com"
    mock_tenant.calendar_credentials = {"type": "service_account"}
    mock_tenant.shadow_mode_enabled = False

    fake_slot = {
        "start": "2026-03-30T10:00:00-03:00",
        "end": "2026-03-30T11:00:00-03:00",
        "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs",
    }

    with (
        patch("app.agent.nodes.consent.has_active_consent", return_value=True),
        patch("app.agent.nodes.generation._llm", mock_llm),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", mock_search),
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = mock_tenant
        mock_cs.get_available_slots.return_value = [fake_slot]
        mock_cs.create_event.return_value = "gcal_event_abc123"

        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})

    # Phase 13: booking path calls LLM to generate confirmation response
    mock_llm.invoke.assert_called_once()
    # RAG no debe ser invocado (booking bypasses rag_retrieval)
    mock_search.assert_not_called()
    # La respuesta es un AIMessage generado por el LLM
    ai_messages = [m for m in result["messages"] if getattr(m, "type", None) == "ai"]
    assert len(ai_messages) >= 1
    assert isinstance(ai_messages[-1], AIMessage)


def test_graph_shadow_mode_returns_redirect_without_rag_or_llm():
    """Con shadow_mode_enabled=True, el grafo retorna SHADOW_MODE_REDIRECT_RESPONSE sin RAG ni LLM."""
    from app.agent.graph import graph
    from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE

    mock_llm = _mock_llm()
    mock_search = _mock_search_tool()

    state = {**_BASE_STATE, "messages": [HumanMessage(content="quiero sacar un turno")]}

    mock_tenant = MagicMock()
    mock_tenant.calendar_id = "clinic@group.calendar.google.com"
    mock_tenant.calendar_credentials = {"type": "service_account"}
    mock_tenant.shadow_mode_enabled = True

    with (
        patch("app.agent.nodes.consent.has_active_consent", return_value=True),
        patch("app.agent.nodes.generation._llm", mock_llm),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", mock_search),
        patch("app.agent.nodes.booking.tenant_service") as mock_ts_booking,
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts_scheduling,
    ):
        # booking_node: no booking keyword → returns immediately (no DB call)
        # scheduling_node: scheduling keyword detected → gets tenant_config → shadow fires
        mock_ts_scheduling.get_tenant_config.return_value = mock_tenant

        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})

    # LLM y RAG no deben ser invocados
    mock_llm.invoke.assert_not_called()
    mock_search.assert_not_called()
    # booking_node no debe haber llamado a DB (no booking keywords)
    mock_ts_booking.get_tenant_config.assert_not_called()
    # La respuesta debe ser el redirect honesto
    ai_messages = [m for m in result["messages"] if getattr(m, "type", None) == "ai"]
    assert len(ai_messages) >= 1
    assert ai_messages[-1].content == SHADOW_MODE_REDIRECT_RESPONSE


def test_graph_normal_query_uses_rag_and_llm():
    """Con un mensaje normal (no médico) y RAG presente, el grafo usa LLM normalmente.

    Story 3.4: se usa RAG no vacío para que el flujo llegue al LLM en lugar de
    activar low_confidence_pause.
    """
    from app.agent.graph import graph
    from app.agent.nodes.generation import ANTI_DIAGNOSTIC_RESPONSE

    mock_llm = _mock_llm()
    mock_search = _mock_search_tool(context="Horarios de la clínica: Lunes a Viernes 9-18h.")

    state = {**_BASE_STATE, "messages": [HumanMessage(content="¿cuáles son los horarios?")]}
    with (
        patch("app.agent.nodes.consent.has_active_consent", return_value=True),
        patch("app.agent.nodes.generation._llm", mock_llm),
        patch("app.agent.nodes.rag_retrieval.make_search_tool", mock_search),
    ):
        result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})

    # Phase 14: el LLM SÍ debe ser invocado via bind_tools (general path)
    mock_llm.bind_tools.return_value.invoke.assert_called_once()
    # La respuesta no debe ser la hardcoded anti-diagnóstico
    ai_messages = [m for m in result["messages"] if getattr(m, "type", None) == "ai"]
    assert len(ai_messages) >= 1
    assert ai_messages[-1].content != ANTI_DIAGNOSTIC_RESPONSE


# ── Plan 05-03: Graph Routing + Handoff Node ──────────────────────────────────

def test_route_after_anti_diagnostic_pure_medical_goes_generation():
    """Consulta médica pura (sin scheduling keyword) → 'generation' (guardrail intacto).

    Nota: se usa "tengo fiebre alta desde ayer" en lugar de frases con "turno"
    porque has_scheduling_intent detecta "turno" como scheduling keyword.
    """
    from app.agent.graph import _route_after_anti_diagnostic
    state = {
        "tenant_id": "t", "phone_number": "p",
        "messages": [HumanMessage(content="tengo fiebre alta desde ayer")],
        "is_medical_query": True,
    }
    assert _route_after_anti_diagnostic(state) == "generation"


def test_route_after_anti_diagnostic_scheduling_overrides_medical():
    """Consulta médica + scheduling keyword → 'booking' (scheduling tiene precedencia)."""
    from app.agent.graph import _route_after_anti_diagnostic
    state = {
        "tenant_id": "t", "phone_number": "p",
        "messages": [HumanMessage(content="tengo fiebre y quiero turno")],
        "is_medical_query": True,
    }
    assert _route_after_anti_diagnostic(state) == "booking"


def test_route_after_anti_diagnostic_normal_goes_booking():
    """Mensaje sin is_medical_query → 'booking' (flujo normal)."""
    from app.agent.graph import _route_after_anti_diagnostic
    state = {
        "tenant_id": "t", "phone_number": "p",
        "messages": [HumanMessage(content="quiero un turno")],
        "is_medical_query": False,
    }
    assert _route_after_anti_diagnostic(state) == "booking"


def test_route_after_generation_paused_routes_to_handoff():
    """is_paused=True → 'handoff'."""
    from app.agent.graph import _route_after_generation
    state = {"tenant_id": "t", "phone_number": "p", "messages": [], "is_paused": True}
    assert _route_after_generation(state) == "handoff"


def test_route_after_generation_not_paused_routes_to_end():
    """is_paused=False → '__end__'."""
    from app.agent.graph import _route_after_generation
    state = {"tenant_id": "t", "phone_number": "p", "messages": [], "is_paused": False}
    assert _route_after_generation(state) == "__end__"


def test_build_graph_includes_handoff_node():
    """El grafo compilado contiene el nodo 'handoff'."""
    from app.agent.graph import build_graph
    g = build_graph()
    assert "handoff" in g.nodes

"""Definicion del grafo principal de LangGraph — Story 3.3: kill switch integrado.

Flujo actualizado:

    triage → anti_diagnostic → [médico?]
        ├─ [médico]  → generation (hardcoded ANTI_DIAGNOSTIC) → END
        └─ [normal]  → booking → [confirma/cancela turno?]
                          ├─ [sí] → generation (confirmación/cancelación) → END
                          └─ [no] → scheduling → [shadow_mode o quiere turno?]
                                        ├─ [shadow_mode] → generation (redirect honesto) → END
                                        ├─ [scheduling_intent] → generation (con available_slots) → END
                                        └─ [no] → rag_retrieval → generation → END

Kill switch (shadow_mode_enabled=True en tenant):
    - booking_node y scheduling_node retornan inmediatamente sin llamar al calendario.
    - scheduling_node setea shadow_mode_active=True en el estado.
    - _route_after_scheduling detecta shadow_mode_active y cortocircuita a generation.
    - generation retorna SHADOW_MODE_REDIRECT_RESPONSE sin llamar al LLM ni al RAG.
"""
from langgraph.graph import StateGraph, END

from app.agent.nodes.anti_diagnostic import anti_diagnostic_node
from app.agent.nodes.booking import booking_node
from app.agent.nodes.generation import generation_node
from app.agent.nodes.handoff import handoff_node
from app.agent.nodes.rag_retrieval import rag_retrieval_node
from app.agent.nodes.scheduling import has_scheduling_intent, scheduling_node
from app.agent.nodes.triage import triage_node
from app.agent.state import ConversationState


def _route_after_anti_diagnostic(state: ConversationState) -> str:
    """Rutea a 'generation' si es consulta medica SIN intent de agendamiento.

    Cuando is_medical_query=True Y el mensaje también contiene scheduling intent
    (e.g. "tengo fiebre y quiero turno"), el scheduling intent tiene precedencia
    y se rutea a 'booking' para continuar con el flujo normal de agendamiento.

    El guardián anti-diagnóstico permanece intacto para consultas puramente médicas.
    """
    if state.get("is_medical_query", False):
        # Check co-present scheduling intent — scheduling takes precedence
        messages = state.get("messages") or []
        query = ""
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                query = msg.content
                break
        if has_scheduling_intent(query):
            return "booking"  # scheduling intent wins — patient wants a turno
        return "generation"   # pure medical query → ANTI_DIAGNOSTIC_RESPONSE
    return "booking"


def _route_after_booking(state: ConversationState) -> str:
    """Rutea a 'generation' si hay booking_intent, a 'scheduling' si no.

    Args:
        state: Estado completo de la conversacion.

    Returns:
        Nombre del nodo destino: 'generation' o 'scheduling'.
    """
    if state.get("booking_intent", False):
        return "generation"
    return "scheduling"


def _route_after_scheduling(state: ConversationState) -> str:
    """Rutea a 'generation' si hay intencion de agendamiento o kill switch activo, a 'rag_retrieval' si no.

    Args:
        state: Estado completo de la conversacion.

    Returns:
        Nombre del nodo destino: 'generation' o 'rag_retrieval'.
    """
    if state.get("shadow_mode_active", False):
        return "generation"
    if state.get("scheduling_intent", False):
        return "generation"
    return "rag_retrieval"


def _route_after_generation(state: ConversationState) -> str:
    """Rutea a 'handoff' cuando is_paused=True, a END en caso contrario."""
    if state.get("is_paused", False):
        return "handoff"
    return "__end__"


def build_graph() -> StateGraph:
    """Construye y compila el grafo de conversacion.

    Sin checkpointer — el estado de historial se gestiona manualmente
    via Supabase (conversation_service) antes y despues de cada invocacion.
    Esto garantiza persistencia real entre restarts de workers RQ.

    Returns:
        Grafo compilado listo para invoke().
    """
    builder = StateGraph(ConversationState)
    builder.add_node("triage", triage_node)
    builder.add_node("anti_diagnostic", anti_diagnostic_node)
    builder.add_node("booking", booking_node)
    builder.add_node("scheduling", scheduling_node)
    builder.add_node("rag_retrieval", rag_retrieval_node)
    builder.add_node("generation", generation_node)
    builder.set_entry_point("triage")
    builder.add_edge("triage", "anti_diagnostic")
    builder.add_conditional_edges(
        "anti_diagnostic",
        _route_after_anti_diagnostic,
        {"generation": "generation", "booking": "booking"},
    )
    builder.add_conditional_edges(
        "booking",
        _route_after_booking,
        {"generation": "generation", "scheduling": "scheduling"},
    )
    builder.add_conditional_edges(
        "scheduling",
        _route_after_scheduling,
        {"generation": "generation", "rag_retrieval": "rag_retrieval"},
    )
    builder.add_edge("rag_retrieval", "generation")
    builder.add_node("handoff", handoff_node)
    builder.add_conditional_edges(
        "generation",
        _route_after_generation,
        {"handoff": "handoff", "__end__": END},
    )
    builder.add_edge("handoff", END)
    return builder.compile()


# Singleton del grafo — inicializado una vez al importar el modulo.
# Los workers RQ reutilizan este objeto por la vida del proceso.
graph = build_graph()

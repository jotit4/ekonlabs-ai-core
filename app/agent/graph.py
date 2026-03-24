"""Definición del grafo principal de LangGraph — Story 2.2: sesión mínima."""
from langgraph.graph import StateGraph, END

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)


def session_node(state: ConversationState) -> dict:
    """Nodo stub de sesión — Story 2.2.

    Registra que la sesión fue inicializada con el historial cargado.
    Stories 2.3+ agregarán nodos de RAG, generación y clasificación de intención.

    En LangGraph 1.x, retornar dict vacío = no modificar ningún campo del estado.
    El merge parcial es manejado automáticamente por LangGraph.

    Args:
        state: ConversationState completo (historial + tenant_id + phone_number).

    Returns:
        Dict vacío — sin cambios al estado en este sprint.
    """
    logger.info(
        "Sesión LangGraph inicializada",
        tenant_id=state["tenant_id"],
        phone_number=state["phone_number"],
        message_count=len(state["messages"]),
    )
    # TODO Story 2.3: Implementar nodo RAG + generación aquí
    return {}


def build_graph() -> StateGraph:
    """Construye y compila el grafo de conversación.

    Sin checkpointer — el estado de historial se gestiona manualmente
    vía Supabase (conversation_service) antes y después de cada invocación.
    Esto garantiza persistencia real entre restarts de workers RQ.

    Returns:
        Grafo compilado listo para invoke().
    """
    builder = StateGraph(ConversationState)
    builder.add_node("session", session_node)
    builder.set_entry_point("session")
    builder.add_edge("session", END)
    return builder.compile()


# Singleton del grafo — inicializado una vez al importar el módulo.
# Los workers RQ reutilizan este objeto por la vida del proceso.
graph = build_graph()

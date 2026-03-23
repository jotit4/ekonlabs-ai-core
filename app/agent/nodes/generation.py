"""Nodo: generar respuesta IA con contexto RAG + System Prompt del Tenant."""
from app.agent.state import ConversationState


def generation_node(state: ConversationState) -> ConversationState:
    """
    Nodo LangGraph: genera la respuesta final del agente inyectando el System Prompt
    específico del Tenant y el contexto RAG recuperado.

    Patrón de inyección (implementación completa en Story 2.3):

    1. Leer state["system_prompt"] (populado por el worker antes de invocar el grafo,
       usando tenant_service.get_tenant_config(tenant_id).system_prompt_override).
       Si ausente, usar el prompt base del sistema.

    2. Construir la lista de mensajes para el LLM:
           [SystemMessage(content=system_prompt), *state["messages"]]

    3. Si state.get("rag_context"): inyectar el contexto RAG en el SystemMessage
       o como HumanMessage adicional antes del último mensaje del usuario.

    4. Invocar ChatOpenAI(model="gpt-4o-mini").invoke(messages).

    5. Retornar state actualizado con AIMessage appended a state["messages"].

    Args:
        state: ConversationState con tenant_id, messages, rag_context (opcional)
               y system_prompt (opcional, del Tenant).

    Returns:
        ConversationState con state["messages"] actualizado con la respuesta IA.
    """
    # TODO: Implementación completa en Story 2.3
    raise NotImplementedError("generation_node se implementa en Story 2.3")

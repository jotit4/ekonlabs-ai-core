"""Nodo: buscar contexto vectorial en pgvector."""
from __future__ import annotations

import structlog

from app.agent.state import ConversationState
from app.agent.tools.search_tool import make_search_tool

logger = structlog.get_logger(__name__)


def rag_retrieval_node(state: ConversationState) -> ConversationState:
    """Retrieve relevant knowledge chunks for the latest user message.

    Extracts the most recent human message from the conversation state,
    searches the tenant's knowledge base using pgvector cosine similarity,
    and stores the retrieved context in `state["rag_context"]` for use by
    the generation node (Story 2.3).

    The tenant_id is always taken from the state — the LLM never influences
    which tenant's knowledge is searched, preserving multi-tenant isolation.

    Args:
        state: Current ConversationState containing tenant_id and messages.

    Returns:
        Updated ConversationState with `rag_context` key populated.
        If no user messages exist or retrieval fails, `rag_context` is set to "".
    """
    tenant_id = state["tenant_id"]

    # Extract the latest user message text for the search query
    query = ""
    messages = state["messages"] if state.get("messages") else []
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        msg_type = getattr(msg, "type", None)
        if msg_type == "human" and content:
            query = content
            break

    if not query:
        logger.debug("rag_retrieval.no_query", tenant_id=tenant_id)
        return {**state, "rag_context": ""}

    try:
        search_tool = make_search_tool(tenant_id)
        rag_context: str = search_tool.invoke({"query": query})
        logger.info(
            "rag_retrieval.done",
            tenant_id=tenant_id,
            query_preview=query[:80],
            context_len=len(rag_context),
        )
    except Exception as exc:
        logger.warning("rag_retrieval.error", tenant_id=tenant_id, error=str(exc))
        rag_context = ""

    return {**state, "rag_context": rag_context}

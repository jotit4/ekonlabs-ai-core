"""Nodo: buscar contexto vectorial en pgvector."""
from __future__ import annotations

import structlog

from app.agent.state import ConversationState
from app.agent.tools.search_tool import make_search_tool

logger = structlog.get_logger(__name__)


def rag_retrieval_node(state: ConversationState) -> dict:
    """Phase 14 no-op — RAG retrieval moved to inline tool calling in generation_node.

    The graph edge rag_retrieval → generation is preserved. This node returns {}
    so the state is unchanged. The LLM in generation_node calls search_knowledge_tool
    directly via bind_tools, and the result is added as a ToolMessage to state["messages"].

    Args:
        state: Current ConversationState (not modified).

    Returns:
        Empty dict — no state fields updated.
    """
    return {}

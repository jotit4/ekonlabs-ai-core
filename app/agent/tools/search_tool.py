"""Tool: búsqueda vectorial en pgvector para LangGraph."""
from __future__ import annotations

import functools

from langchain_core.tools import tool

from app.services.rag_service import search_knowledge


@functools.lru_cache(maxsize=64)
def make_search_tool(tenant_id: str):
    """Factory that returns a knowledge search tool bound to a specific tenant.

    The result is cached by tenant_id — the @tool closure is created once per
    tenant and reused on subsequent calls, avoiding repeated LangChain introspection.

    The tenant_id is injected from the ConversationState — the LLM never
    receives or chooses it, ensuring strict multi-tenant isolation.

    Args:
        tenant_id: UUID of the tenant for this conversation session.

    Returns:
        A cached LangChain tool that searches the tenant's knowledge base.
    """

    @tool
    def search_knowledge_tool(query: str) -> str:
        """Search the clinic's knowledge base for information relevant to the query.

        Use this tool whenever you need factual information about the clinic's
        services, prices, schedules, or policies.

        Args:
            query: Natural language question or keywords to search for.

        Returns:
            Concatenated text of the most relevant knowledge chunks.
        """
        results = search_knowledge(tenant_id=tenant_id, query=query, k=5)
        if not results:
            return ""
        return "\n\n---\n\n".join(r["content"] for r in results)

    return search_knowledge_tool

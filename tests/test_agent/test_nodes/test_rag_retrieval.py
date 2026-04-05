"""Tests para app/agent/nodes/rag_retrieval.py — Phase 14 no-op (RAG-02)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.rag_retrieval import rag_retrieval_node

TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _base_state(messages):
    return {"tenant_id": TENANT_ID, "phone_number": "+5491100000000", "messages": messages}


def test_rag_retrieval_node_is_noop():
    """RAG-02: rag_retrieval_node returns {} without calling make_search_tool."""
    msgs = [HumanMessage(content="cuanto cuesta la ortodoncia")]
    with patch("app.agent.nodes.rag_retrieval.make_search_tool") as mock_make:
        result = rag_retrieval_node(_base_state(msgs))
    mock_make.assert_not_called()
    assert result == {}


def test_rag_retrieval_node_noop_with_multiple_messages():
    """RAG-02: no-op even with multiple messages in history."""
    msgs = [
        HumanMessage(content="me interesa la ortodoncia"),
        AIMessage(content="Claro, tenemos varios planes..."),
        HumanMessage(content="y cuanto sale"),
    ]
    with patch("app.agent.nodes.rag_retrieval.make_search_tool") as mock_make:
        result = rag_retrieval_node(_base_state(msgs))
    mock_make.assert_not_called()
    assert result == {}


def test_rag_retrieval_node_noop_with_empty_messages():
    """RAG-02: no-op even with empty message list."""
    with patch("app.agent.nodes.rag_retrieval.make_search_tool") as mock_make:
        result = rag_retrieval_node(_base_state([]))
    mock_make.assert_not_called()
    assert result == {}


def test_rag_retrieval_node_does_not_populate_rag_context():
    """RAG-02: returned dict does NOT contain rag_context key."""
    msgs = [HumanMessage(content="cuales son los horarios")]
    with patch("app.agent.nodes.rag_retrieval.make_search_tool"):
        result = rag_retrieval_node(_base_state(msgs))
    assert "rag_context" not in result


def test_rag_retrieval_node_noop_regardless_of_tenant():
    """RAG-02: no-op for any tenant_id value."""
    for tenant in ["tenant-a", "tenant-b", "00000000-0000-0000-0000-000000000000"]:
        state = {"tenant_id": tenant, "phone_number": "+54", "messages": [HumanMessage(content="hola")]}
        with patch("app.agent.nodes.rag_retrieval.make_search_tool") as mock_make:
            result = rag_retrieval_node(state)
        mock_make.assert_not_called()
        assert result == {}

"""Tests para app/agent/nodes/rag_retrieval.py — rag_retrieval_node (RAG-05)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.rag_retrieval import rag_retrieval_node

TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _base_state(messages):
    return {"tenant_id": TENANT_ID, "phone_number": "+5491100000000", "messages": messages}


def test_rag_retrieval_uses_last_two_human_messages():
    """RAG-05: con 2+ human messages, el query combina los últimos 2 en orden cronológico."""
    msgs = [
        HumanMessage(content="me interesa la ortodoncia"),
        AIMessage(content="Claro, tenemos varios planes..."),
        HumanMessage(content="y cuanto sale"),
    ]
    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "Precio ortodoncia: $50.000"
    with patch("app.agent.nodes.rag_retrieval.make_search_tool", return_value=mock_tool):
        result = rag_retrieval_node(_base_state(msgs))
    call_kwargs = mock_tool.invoke.call_args[0][0]
    assert "ortodoncia" in call_kwargs["query"]
    assert "cuanto sale" in call_kwargs["query"]
    assert result["rag_context"] == "Precio ortodoncia: $50.000"


def test_rag_retrieval_single_message_works():
    """RAG-05: con 1 solo human message, query = ese mensaje, sin error."""
    msgs = [HumanMessage(content="cuales son los horarios")]
    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "Horarios: Lun-Vie 9-18h"
    with patch("app.agent.nodes.rag_retrieval.make_search_tool", return_value=mock_tool):
        result = rag_retrieval_node(_base_state(msgs))
    call_kwargs = mock_tool.invoke.call_args[0][0]
    assert call_kwargs["query"] == "cuales son los horarios"
    assert result["rag_context"] == "Horarios: Lun-Vie 9-18h"


def test_rag_retrieval_uses_only_human_messages():
    """RAG-05: mensajes de AI NO se incluyen en el query."""
    msgs = [
        HumanMessage(content="necesito un turno"),
        AIMessage(content="Claro, para qué especialidad?"),
        AIMessage(content="Tenemos disponibilidad el lunes"),
    ]
    mock_tool = MagicMock()
    mock_tool.invoke.return_value = ""
    with patch("app.agent.nodes.rag_retrieval.make_search_tool", return_value=mock_tool):
        rag_retrieval_node(_base_state(msgs))
    call_kwargs = mock_tool.invoke.call_args[0][0]
    assert "Claro" not in call_kwargs["query"]
    assert "Tenemos disponibilidad" not in call_kwargs["query"]
    assert "necesito un turno" in call_kwargs["query"]


def test_rag_retrieval_empty_messages_returns_empty_rag_context():
    """RAG-05: messages=[] → rag_context='' sin llamar al search tool."""
    mock_tool = MagicMock()
    with patch("app.agent.nodes.rag_retrieval.make_search_tool", return_value=mock_tool):
        result = rag_retrieval_node(_base_state([]))
    mock_tool.invoke.assert_not_called()
    assert result["rag_context"] == ""


def test_rag_retrieval_passes_combined_query_to_search_tool():
    """RAG-05: el query combinado se pasa al tool como dict {"query": combined_str}."""
    msgs = [
        HumanMessage(content="me interesa blanqueamiento"),
        AIMessage(content="Con mucho gusto..."),
        HumanMessage(content="tienen financiacion"),
    ]
    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "Financiacion disponible en 12 cuotas"
    with patch("app.agent.nodes.rag_retrieval.make_search_tool", return_value=mock_tool):
        rag_retrieval_node(_base_state(msgs))
    # Must be called with a dict containing "query" key
    call_positional = mock_tool.invoke.call_args[0][0]
    assert isinstance(call_positional, dict)
    assert "query" in call_positional
    combined = call_positional["query"]
    assert "blanqueamiento" in combined
    assert "financiacion" in combined

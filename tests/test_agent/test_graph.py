"""Tests para app/agent/graph.py — grafo LangGraph mínimo (Story 2.2)."""
from langchain_core.messages import HumanMessage, AIMessage

from app.agent.state import ConversationState


_BASE_STATE: ConversationState = {
    "tenant_id": "test-tenant-uuid",
    "phone_number": "15551234567",
    "messages": [],
    "confidence_score": 1.0,
    "is_paused": False,
}


def test_graph_is_compiled():
    """El grafo se compila sin errores al importar el módulo."""
    from app.agent.graph import graph
    assert graph is not None


def test_session_node_returns_empty_dict():
    """session_node retorna dict vacío — no modifica el estado en Story 2.2."""
    from app.agent.graph import session_node
    state = {**_BASE_STATE, "messages": [HumanMessage(content="test")]}
    result = session_node(state)
    assert result == {}


def test_graph_invoke_returns_state():
    """graph.invoke() retorna un estado válido con los campos correctos."""
    from app.agent.graph import graph
    state = {**_BASE_STATE, "messages": [HumanMessage(content="Hola")]}
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
    result = graph.invoke(state, config={"configurable": {"thread_id": "tenant:phone"}})
    # Los mensajes del historial deben estar presentes en el resultado
    assert len(result["messages"]) >= 2
    assert result["messages"][0].content == "Primera consulta"
    assert result["messages"][1].content == "Respuesta previa"


def test_graph_invoke_with_empty_messages():
    """graph.invoke() funciona correctamente con historial vacío."""
    from app.agent.graph import graph
    state = {**_BASE_STATE, "messages": []}
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
    # No debe lanzar excepción con el formato correcto
    result = graph.invoke(state, config={"configurable": {"thread_id": expected_thread_id}})
    assert result is not None

"""Tests para app/agent/nodes/handoff.py — Plan 05-03: handoff_node."""
from unittest.mock import patch, MagicMock
from app.agent.nodes.handoff import handoff_node


def test_handoff_node_returns_empty_dict():
    state = {
        "tenant_id": "test-tenant",
        "phone_number": "+5491100000000",
        "messages": [],
        "is_paused": True,
        "confidence_score": 0.0,
    }
    result = handoff_node(state)
    assert result == {}


def test_handoff_node_logs_operator_notified():
    state = {"tenant_id": "t1", "phone_number": "+54911", "messages": [], "confidence_score": 0.0}
    with patch("app.agent.nodes.handoff.logger") as mock_logger:
        handoff_node(state)
    mock_logger.info.assert_called_once_with(
        "handoff_node.operator_notified",
        tenant_id="t1",
        phone_number="+54911",
        confidence_score=0.0,
        reason="low_confidence_pause",
    )


def test_handoff_node_does_not_raise_on_missing_optional_fields():
    state = {"tenant_id": "t", "phone_number": "+5491100000000", "messages": []}
    result = handoff_node(state)
    assert result == {}


def test_handoff_node_exception_is_caught():
    state = {"tenant_id": "t", "phone_number": "+5491100000000", "messages": []}
    with patch("app.agent.nodes.handoff.logger") as mock_logger:
        mock_logger.info.side_effect = Exception("log failure")
        result = handoff_node(state)
    assert result == {}
    mock_logger.warning.assert_called_once()

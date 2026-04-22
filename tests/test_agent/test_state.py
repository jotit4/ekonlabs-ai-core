"""Tests for app/agent/state.py — ConversationState schema (Phase 12, NAME-01)."""
from typing import get_type_hints

from langchain_core.messages import HumanMessage


def _minimal_state():
    """Minimal valid ConversationState with only required fields."""
    return {
        "tenant_id": "test-tenant-id",
        "phone_number": "+5491100000000",
        "messages": [HumanMessage(content="Hola")],
    }


def test_conversation_state_has_patient_name_field():
    """NAME-01: ConversationState declares patient_name: NotRequired[str | None]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "patient_name" in hints, "ConversationState missing patient_name field"


def test_conversation_state_has_name_collection_active_field():
    """NAME-01: ConversationState declares name_collection_active: NotRequired[bool]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "name_collection_active" in hints, "ConversationState missing name_collection_active field"


def test_conversation_state_has_slot_presented_at_field():
    """NAME-01: ConversationState declares slot_presented_at: NotRequired[str | None]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "slot_presented_at" in hints, "ConversationState missing slot_presented_at field"


def test_instantiation_without_new_fields_does_not_raise():
    """NAME-01: ConversationState can be built without the 3 new fields — no KeyError or TypeError."""
    state = _minimal_state()
    # Accessing via .get() on a plain dict — no exception raised
    assert state.get("patient_name") is None
    assert state.get("name_collection_active") is None
    assert state.get("slot_presented_at") is None


def test_new_fields_absent_by_default_in_minimal_state():
    """NAME-01: New fields are NOT present in minimal state dict (NotRequired = optional)."""
    state = _minimal_state()
    assert "patient_name" not in state
    assert "name_collection_active" not in state
    assert "slot_presented_at" not in state


def test_new_fields_can_be_set_and_read():
    """NAME-01: New fields can be set and retrieved from a state dict."""
    state = _minimal_state()
    state["patient_name"] = "María García"
    state["name_collection_active"] = True
    state["slot_presented_at"] = "2026-04-05T10:00:00-03:00"

    assert state["patient_name"] == "María García"
    assert state["name_collection_active"] is True
    assert state["slot_presented_at"] == "2026-04-05T10:00:00-03:00"


# ---------------------------------------------------------------------------
# Tests — Booking rules per service (migration 006)
# ---------------------------------------------------------------------------

def test_state_has_walk_in_service_field():
    """Migration 006: ConversationState declares walk_in_service: NotRequired[bool]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "walk_in_service" in hints, "ConversationState missing walk_in_service field"


def test_state_has_gated_service_active_field():
    """Migration 006: ConversationState declares gated_service_active: NotRequired[bool]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "gated_service_active" in hints, "ConversationState missing gated_service_active field"


def test_state_has_gated_service_name_field():
    """Migration 006: ConversationState declares gated_service_name: NotRequired[str | None]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "gated_service_name" in hints, "ConversationState missing gated_service_name field"


def test_state_has_gated_prerequisite_note_field():
    """Migration 006: ConversationState declares gated_prerequisite_note: NotRequired[str | None]."""
    from app.agent.state import ConversationState

    hints = get_type_hints(ConversationState, include_extras=True)
    assert "gated_prerequisite_note" in hints, "ConversationState missing gated_prerequisite_note field"


def test_booking_rule_fields_absent_by_default():
    """Booking rule fields are NOT present in minimal state dict (NotRequired = optional)."""
    state = _minimal_state()
    assert "walk_in_service" not in state
    assert "gated_service_active" not in state
    assert "gated_service_name" not in state
    assert "gated_prerequisite_note" not in state


def test_booking_rule_fields_can_be_set_and_read():
    """Booking rule fields can be set and retrieved from a state dict."""
    state = _minimal_state()
    state["walk_in_service"] = True
    state["gated_service_active"] = True
    state["gated_service_name"] = "Aquagym"
    state["gated_prerequisite_note"] = "Primero debés ver al Dr. Rodríguez."

    assert state["walk_in_service"] is True
    assert state["gated_service_active"] is True
    assert state["gated_service_name"] == "Aquagym"
    assert state["gated_prerequisite_note"] == "Primero debés ver al Dr. Rodríguez."

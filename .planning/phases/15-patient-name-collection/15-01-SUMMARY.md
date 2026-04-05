---
phase: 15-patient-name-collection
plan: "01"
status: complete
completed_at: 2026-04-05
---

# Summary — Plan 15-01: Booking Deferral for Name Collection

## What was done
- Added `name_attempts: NotRequired[int]` to `ConversationState` in state.py (tracks how many times agent has asked for name; absent = 0)
- Added `from datetime import datetime, timezone` import to booking.py
- In `booking_node` confirm flow, after `chosen_slot = slots[actual_idx]`: deferral check before `create_event`
  - If `not state.get("patient_name")`: returns `{booking_intent: True, booking_action: "confirm", name_collection_active: True, booked_slot, selected_slot_index, slot_presented_at, calendar_event_id: None}` without calling calendar API
  - If `patient_name` present: calls `create_event(title=f"Turno — {patient_name}")`
- Updated 3 existing tests: added `patient_name="Test Patient"` to `test_confirm_uses_state_slots_without_calendar_call`, `test_confirm_fallback_calls_calendar_when_no_state_slots`, `test_confirm_fallback_calls_calendar_when_state_slots_empty`; first also gets title assertion
- Added 3 new NAME tests: test_booking_node_defers_when_no_patient_name, test_booking_node_deferral_includes_selected_slot_index, test_booking_node_creates_event_with_patient_name_in_title

## Requirements satisfied
- NAME-02 ✓ — booking_node defers event creation when patient_name absent; no calendar event created until name captured
- NAME-03 ✓ — booking_node creates event with title="Turno — {patient_name}" when name present

## Tests
- Booking tests: 37/37 pass (3 updated + 3 new)
- Full suite: 262 pass (excluding pre-existing failures)

## Deviations from Plan

None — plan executed exactly as written.

## Commit
- `b2f8f5d`: feat(v1.2): Phase 15 — Patient name collection before booking confirmation

## Self-Check: PASSED
- app/agent/state.py — name_attempts field added
- app/agent/nodes/booking.py — deferral check + title passthrough added
- tests/test_agent/test_nodes/test_booking.py — 3 updated, 3 new, 37/37 pass

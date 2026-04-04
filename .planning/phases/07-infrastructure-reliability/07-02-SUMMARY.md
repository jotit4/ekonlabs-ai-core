---
phase: "07"
plan: "02"
subsystem: booking-node
tags: [tdd, race-condition, calendar, state-management, infra]
dependency_graph:
  requires: [app/agent/nodes/booking.py, app/agent/state.py]
  provides: [INFRA-05 race window elimination]
  affects: [booking_node confirmation path]
tech_stack:
  added: []
  patterns: ["state.get() or fallback" pattern for cached-first reads]
key_files:
  created: []
  modified:
    - app/agent/nodes/booking.py
    - tests/test_agent/test_nodes/test_booking.py
decisions:
  - "Use Python 'or' operator so both None and [] fall through to calendar fetch"
  - "Read state cached slots first; only re-fetch on absent/empty (conversation resumed edge case)"
metrics:
  duration: "9 min"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 2
---

# Phase 07 Plan 02: Fix Booking Race Window — Read State Slots First (INFRA-05) Summary

**One-liner:** One-line `state.get("available_slots") or calendar_fetch` in booking_node eliminates the race window between slot display and slot booking.

## What Was Built

`booking_node`'s confirmation path previously always re-fetched available slots from Google Calendar, even though `scheduling_node` had already stored them in `state["available_slots"]`. This created a race window: if a slot filled between the scheduling fetch and the booking fetch, the patient could book a phantom (already-taken) slot.

The fix uses Python's `or` operator semantics intentionally:
- `state.get("available_slots")` returns the cached list if present and non-empty
- `None` (key absent) and `[]` (empty list) are both falsy — both fall through to the calendar re-fetch
- The calendar re-fetch is retained as a correct fallback for resumed conversations where state was not populated by `scheduling_node`

## TDD Execution

**RED phase (commit `0c5532b`):** Added three failing tests:
- `test_confirm_uses_state_slots_without_calendar_call` — asserts `get_available_slots` is NOT called when state has slots
- `test_confirm_fallback_calls_calendar_when_no_state_slots` — asserts calendar IS called when key is absent
- `test_confirm_fallback_calls_calendar_when_state_slots_empty` — asserts calendar IS called when value is `[]`

All three failed as expected (calendar was called unconditionally).

**GREEN phase (commit `5e4f732`):** Replaced the unconditional `calendar_service.get_available_slots(...)` call with `state.get("available_slots") or calendar_service.get_available_slots(...)` — one logical line change plus a comment block.

**Result:** 34/34 tests pass. All 31 pre-existing tests unchanged.

## Verification

```
tests/test_agent/test_nodes/test_booking.py — 34 passed, 1 warning in 0.73s
```

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **`or` operator over explicit `if`:** The plan specified `or` explicitly. It is idiomatic Python and correctly handles both `None` and `[]` as falsy, making the intent clear without extra lines.
2. **Comment block retained:** A 3-line comment explaining INFRA-05 was added above the fix line to make the intent durable for future maintainers.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `0c5532b` | test | RED — three failing tests for INFRA-05 race fix |
| `5e4f732` | feat | GREEN — `state.get("available_slots") or calendar_fetch` |

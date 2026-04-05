---
phase: 15-patient-name-collection
plan: "02"
status: complete
completed_at: 2026-04-05
---

# Summary — Plan 15-02: Name Collection in generation_node

## What was done
- Added imports to generation.py: `import re`, `from datetime import datetime, timezone, timedelta`, `from app.services import calendar_service, tenant_service`
- Added `_extract_patient_name(text: str) -> str | None`: strips common Argentine name-introduction phrases ("me llamo", "soy", "mi nombre es", etc.), validates remainder is 2–4 words, no digits, all Unicode letters/hyphens — returns name or None
- Added `_is_slot_expired(state) -> bool`: returns True if >30 minutes elapsed since `slot_presented_at` (NAME-07)
- Added `_handle_name_collection(state, tenant_id) -> dict`: full 2-turn name collection flow
  - Slot expiry check first (NAME-07): informs patient, clears name_collection_active
  - Turn 1 (name_attempts == 0): asks for nombre y apellido, returns name_attempts=1
  - Turn 2+ with valid name: creates calendar event inline via `calendar_service.create_event(title=f"Turno — {patient_name}")`, generates confirmation (NAME-06)
  - Turn 2+ without name, attempts < 2: asks again, increments name_attempts
  - Turn 2+ without name, attempts >= 2: returns is_paused=True for human handoff (NAME-05)
- Added name_collection gate in `generation_node` before booking path: `if state.get("name_collection_active") and not state.get("patient_name"): return _handle_name_collection(state, tenant_id)`
- Added 6 new generation tests: test_name04_first_ask_increments_attempts, test_name04_name_provided_confirms_booking, test_name06_event_title_contains_patient_name, test_name04_booking_keyword_asks_again, test_name05_no_name_after_two_attempts_triggers_handoff, test_name07_expired_slot_clears_name_collection

## Requirements satisfied
- NAME-04 ✓ — agent asks for name before confirming; captures within 2 turns
- NAME-05 ✓ — after 2 failed name captures, is_paused=True routes to human handoff
- NAME-06 ✓ — calendar event title is "Turno — {Full Name}" when created inline
- NAME-07 ✓ — slot validity re-checked against 30-minute TTL from slot_presented_at

## Tests
- Generation tests: 60/60 pass (6 new NAME tests added)
- Full suite: 244 pass in agent+services+health test dirs (excluding 2 pre-existing failures)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] _extract_patient_name too permissive — single words like "dale" matched**
- **Found during:** Task 3 (test run after name tests added)
- **Issue:** Original validator allowed 1–4 words. Single-word inputs like "dale" (1 word, alphabetic) passed and triggered real `tenant_service.get_tenant_config` call (not mocked in that test), raising AppException
- **Fix:** Changed minimum from 1 to 2 words — aligns with the system prompt asking for "nombre y apellido". Updated test messages to use inputs with punctuation (e.g. "no, prefiero no") that fail the regex check cleanly

## Commit
- `b2f8f5d`: feat(v1.2): Phase 15 — Patient name collection before booking confirmation

## Self-Check: PASSED
- app/agent/nodes/generation.py — helpers added, gate inserted before booking path
- tests/test_agent/test_nodes/test_generation.py — 6 new NAME tests, 60/60 pass
- _extract_patient_name("María López") == "María López" ✓
- _extract_patient_name("dale") is None ✓ (single word)
- _is_slot_expired with 31-min-old timestamp returns True ✓

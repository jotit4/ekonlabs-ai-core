---
plan: "05-02"
phase: "05-intent-detection-fixes"
status: completed
completed_at: 2026-04-04
tags: [bug-fix, tdd, slot-selection, booking, generation]
key-files:
  modified:
    - app/agent/state.py
    - app/agent/nodes/booking.py
    - app/agent/nodes/generation.py
    - tests/test_agent/test_nodes/test_booking.py
    - tests/test_agent/test_nodes/test_generation.py
decisions:
  - "Phrase keys 'el N' moved from PHRASE_KEYS to separate regex check with word-boundary to prevent 'el 2' matching 'el 21'"
  - "_detect_slot_index returns None (not 0) on no match — callers must handle None explicitly"
  - "booking_ambiguous_slot check placed as FIRST branch in generation_node booking block — before booking_action evaluation"
metrics:
  duration: "~25 minutes"
  tasks_completed: 3
  tests_added: 11
  tests_total: 281
---

# Summary — Plan 05-02: Slot Selection Ambiguity Fix

**One-liner:** Fixed silent slot 0 default in `_detect_slot_index` using word-boundary regex and None return, with `booking_ambiguous_slot` state flag driving Argentine voseo clarification in `generation_node`.

## Changes made

- `app/agent/state.py`: Added `booking_ambiguous_slot: NotRequired[bool]` after `selected_slot_index` — uses `NotRequired` per project convention, import already present
- `app/agent/nodes/booking.py`: Replaced `_detect_slot_index` implementation — switched from flat `SLOT_INDEX_MAP` with plain substring matching to separate `PHRASE_KEYS` (word ordinals) + `"el N"` word-boundary regex + bare `DIGIT_KEYS` word-boundary regex; returns `None` on no match. Confirmation flow now checks `selected_idx is None` before calling calendar — returns `booking_ambiguous_slot=True` early without touching Google Calendar
- `app/agent/nodes/generation.py`: Added `booking_ambiguous_slot` check as the first branch inside `if booking_intent:` — returns `"No pude identificar cuál turno preferís. ¿Podés decirme el número? Por ejemplo: 1, 2 o 3."` without calling `_llm.invoke`

## Tests added

**test_booking.py (9 new tests):**
- `test_state_has_booking_ambiguous_slot` — ConversationState annotation check
- `test_state_partial_invoke_without_flag` — partial state construction without flag
- `test_detect_slot_index_returns_none_on_no_match` — "confirmo sin numero" → None
- `test_detect_slot_index_digit_1_matches` — "quiero el 1" → 0
- `test_detect_slot_index_bare_1_matches` — "1" → 0
- `test_false_positive_1430_no_slot` — "a las 14:30" → None
- `test_false_positive_21_de_abril_no_slot` — "el 21 de abril" → None
- `test_booking_node_ambiguous_sets_flag` — "confirmo" → booking_ambiguous_slot=True, create_event not called
- `test_booking_node_clear_digit_books` — "el 1" → booking_intent=True, no ambiguous flag

**test_generation.py (3 new tests):**
- `test_booking_ambiguous_slot_returns_clarification` — "preferís" in response, _llm not called
- `test_booking_clear_confirm_not_clarification` — clear booking returns BOOKING_CONFIRMED_TEMPLATE
- `test_booking_ambiguous_no_llm_call` — _llm.invoke assert_not_called

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] "el 2" phrase key substring-matched "el 21 de abril"**
- **Found during:** Task 2 GREEN phase (test `test_false_positive_21_de_abril_no_slot` failed)
- **Issue:** The plan's `PHRASE_KEYS` dict included `"el 1"`, `"el 2"`, `"el 3"` using plain `if key in normalized_query` substring matching. "el 2" is a substring of "el 21", causing false matches on date strings like "el 21 de abril"
- **Fix:** Removed `"el 1"/"el 2"/"el 3"` from `PHRASE_KEYS` and added a separate loop using `re.search(rf"\bel {digit}\b", ...)` word-boundary regex — same word-boundary approach as bare digits
- **Files modified:** `app/agent/nodes/booking.py`
- **Commit:** 4409d25

## Verification

All 281 tests pass (58 in booking + generation files, 223 elsewhere).

```
_detect_slot_index("14:30") → None            (word-boundary prevents "1" in "14")
_detect_slot_index("el 21 de abril") → None   (word-boundary prevents "el 2" in "el 21")
_detect_slot_index("confirmo") → None         (no slot indicator present)
_detect_slot_index("el 1") → 0               (explicit slot selection)
booking_node("confirmo") → booking_ambiguous_slot=True, create_event NOT called
generation_node(booking_ambiguous_slot=True) → "preferís" message, _llm.invoke NOT called
```

## Self-Check: PASSED

- `app/agent/state.py` modified: booking_ambiguous_slot present in annotations
- `app/agent/nodes/booking.py` modified: _detect_slot_index returns int | None
- `app/agent/nodes/generation.py` modified: ambiguous slot branch added
- Commits: 716a990, 4409d25, eb06030 — all verified in git log

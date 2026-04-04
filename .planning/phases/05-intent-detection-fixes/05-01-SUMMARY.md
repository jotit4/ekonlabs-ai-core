---
plan: "05-01"
phase: "05-intent-detection-fixes"
status: completed
completed_at: 2026-04-04
subsystem: intent-classification
tags: [keyword-classifier, tdd, booking, scheduling, triage, false-positives]
dependency_graph:
  requires: []
  provides: [has_scheduling_intent, BOOKING_CONFIRM_KEYWORDS-extended, PAIN_URGENCY_KEYWORDS-fixed]
  affects: [booking_node, scheduling_node, triage_node]
tech_stack:
  added: []
  patterns: [space-padded substring matching for word-boundary safety]
key_files:
  created: []
  modified:
    - app/agent/nodes/booking.py
    - app/agent/nodes/scheduling.py
    - app/agent/nodes/triage.py
    - tests/test_agent/test_nodes/test_booking.py
    - tests/test_agent/test_nodes/test_scheduling.py
    - tests/test_agent/test_nodes/test_triage.py
decisions:
  - "Used space-padded query matching (f' {normalized_query} ') instead of raw substring to prevent 'va' from matching inside 'reservar'"
  - "Did NOT add 'ardor de' to PAIN_URGENCY_KEYWORDS — 'ardor de estomago' must stay normal; used 'ardor en' instead"
  - "Renamed _has_scheduling_intent to has_scheduling_intent (public) to allow graph.py import in later plans"
metrics:
  duration_minutes: 15
  tasks_completed: 3
  files_modified: 6
  tests_added: 24
---

# Phase 05 Plan 01: Keyword Classifier Fixes Summary

**One-liner:** Fixed three isolated keyword classifier bugs: Argentine colloquial booking confirmations, dead code removal with phrase additions in scheduling, and false-positive elimination for "ardor"/"sangre" in triage.

## Changes Made

- `app/agent/nodes/booking.py`: Added 8 Argentine colloquial confirmations to `BOOKING_CONFIRM_KEYWORDS` (`dale`, `listo`, `va`, `anotame`, `poneme`, `agendame`, `reservame`, `tomame ese`); fixed word-boundary substring matching by padding normalized query with spaces to prevent `"va"` from false-matching inside `"reservar"`
- `app/agent/nodes/scheduling.py`: Removed dead `SCHEDULING_INTENT_KEYWORDS` frozenset (was never read by classifier); added `"quiero atencion"`, `"hay algo para manana"`, `"quisiera pedir hora"` to `_DIRECT_PATTERNS`; renamed `_has_scheduling_intent` → `has_scheduling_intent` (public, importable for future graph.py usage)
- `app/agent/nodes/triage.py`: Removed bare `"ardor"` and `"sangre"` keywords; added `"ardor en"`, `"ardor intenso"`, `"ardor fuerte"`, `"sangrado"` — eliminates false positives on "ardor de estomago" (heartburn inquiry) and "análisis de sangre" (lab test) while preserving true urgency detection

## Tests Added

- `test_booking.py`: 8 Argentine confirm keyword tests (`test_argentine_confirm_keywords_dale` through `test_argentine_confirm_keywords_tomame_ese`) + 1 negative guard (`test_argentine_confirm_keywords_negative_reservar_para_manana`)
- `test_scheduling.py`: 3 new scheduling intent tests (`test_quiero_atencion_scheduling_intent`, `test_hay_algo_manana_scheduling_intent`, `test_quisiera_pedir_hora_scheduling_intent`) + 1 dead-code removal test (`test_scheduling_intent_keywords_removed`) + 2 negative guards
- `test_triage.py`: 5 false-positive/true-positive tests (`test_false_positive_analisis_de_sangre_no_urgency`, `test_false_positive_ardor_de_estomago_no_urgency`, `test_sangrado_triggers_urgency`, `test_ardor_en_triggers_urgency`, `test_sangrado_solo_triggers_urgency`) + 2 non-regression guards

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed word-boundary false positive for short keyword "va"**
- **Found during:** Task 1 (GREEN phase — negative test `test_argentine_confirm_keywords_negative_reservar_para_manana` failed)
- **Issue:** Substring match `"va" in "reservar para manana"` returned True because `"va"` appears inside `"reser**va**r"`
- **Fix:** Changed keyword matching from `kw in normalized_query` to `f" {kw} " in f" {normalized_query} "` (space-padded on both sides) for both `BOOKING_CONFIRM_KEYWORDS` and `BOOKING_CANCEL_KEYWORDS`
- **Files modified:** `app/agent/nodes/booking.py`
- **Commit:** 171c2a4

**2. [Rule 4 deviation avoidance] Did NOT add "ardor de" to triage keywords**
- **Found during:** Task 3 planning — plan action list said to add "ardor de" but must-haves truth says "ardor de estomago" returns normal. These are contradictory.
- **Resolution:** Added `"ardor en"` instead (specific to "ardor en el pecho"), skipped `"ardor de"` entirely. The must-haves truth table was treated as authoritative.

## Verification

All 63 tests pass (up from 41 baseline). `SCHEDULING_INTENT_KEYWORDS` removed. "análisis de sangre" → `empathy_mode=normal`. "ardor de estomago" → `empathy_mode=normal`. "sangrado abundante" → `empathy_mode=urgent`. "tengo ardor en el pecho" → `empathy_mode=urgent`.

## Self-Check: PASSED

- `app/agent/nodes/booking.py` — exists, contains `BOOKING_CONFIRM_KEYWORDS` with 8 new keywords and space-padded matching
- `app/agent/nodes/scheduling.py` — exists, `SCHEDULING_INTENT_KEYWORDS` absent, `has_scheduling_intent` exported
- `app/agent/nodes/triage.py` — exists, `"ardor"` and `"sangre"` removed, `"ardor en"` and `"sangrado"` added
- Commits 7485b50 (RED) and 171c2a4 (GREEN) verified in git log

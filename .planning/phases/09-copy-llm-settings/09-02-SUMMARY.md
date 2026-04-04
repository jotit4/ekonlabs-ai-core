---
phase: 09-copy-llm-settings
plan: "02"
subsystem: agent/nodes
tags: [copy, llm-settings, voseo, accents, temperature, timeout]
requirements: [COPY-04, COPY-05]

dependency_graph:
  requires: [09-01]
  provides: [corrected-default-system-prompt, tuned-llm-singleton]
  affects: [generation_node, DEFAULT_SYSTEM_PROMPT, _llm]

tech_stack:
  added: []
  patterns: [ChatOpenAI-singleton, module-level-constants]

key_files:
  modified:
    - app/agent/nodes/generation.py
    - tests/test_agent/test_nodes/test_generation.py

decisions:
  - temperature reduced from 0.7 to 0.3 for deterministic medical reception responses
  - request_timeout=20 added to prevent worker blocking on slow OpenAI calls
  - voseo imperatives (Ayudás, Respondé, Sé, cálido) align with Argentine WhatsApp conventions

metrics:
  duration: 68s
  completed: 2026-04-04
  tasks_completed: 4
  files_modified: 2
  tests_added: 3
  tests_total: 332
---

# Phase 9 Plan 02: Copy & LLM Settings — System Prompt Fix + LLM Tuning Summary

**One-liner:** Fixed DEFAULT_SYSTEM_PROMPT with full Spanish accents and Argentine voseo imperatives; tuned ChatOpenAI singleton to temperature=0.3 and request_timeout=20.

---

## What Was Built

**COPY-04 — DEFAULT_SYSTEM_PROMPT orthography fix:**
- Added all missing accents: `recepción`, `médica`, `información`, `clínica`, `diagnósticos`, `médicos`, `cálido`
- Aligned imperatives to Argentine voseo: `Ayudás`, `Respondé`, `Sé conciso`
- Prior version had plain ASCII Spanish with tuteo imperatives inconsistent with the product's Argentine WhatsApp target audience

**COPY-05 — ChatOpenAI singleton tuning:**
- `temperature`: 0.7 → 0.3 — reduces LLM randomness for more deterministic replies in a medical reception context
- `request_timeout=20` — caps blocking on slow OpenAI responses; prevents Celery/RQ workers from hanging indefinitely

**Tests added (3):**
- `test_default_system_prompt_has_correct_accents` — verifies `recepción` and `médica` present
- `test_llm_temperature_is_0_3` — verifies `_llm.temperature == 0.3`
- `test_llm_request_timeout_is_20` — verifies `_llm.request_timeout == 20`

---

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix DEFAULT_SYSTEM_PROMPT — COPY-04 | d6102c3 | app/agent/nodes/generation.py |
| 2 | Tune ChatOpenAI — COPY-05 | 0e9bedc | app/agent/nodes/generation.py |
| 3 | Add LLM settings tests | 5789530 | tests/test_agent/test_nodes/test_generation.py |
| 4 | Full test suite — 332 passed | (verified) | — |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Verification Results

```
332 passed, 2 warnings in 2.47s
```

- 329 pre-existing tests: all pass (no regressions)
- 3 new tests: all pass
- COPY-04 spot-check: `recepción`, `médica`, `Ayudás`, `Respondé` all confirmed present
- COPY-05 spot-check: `temperature=0.3`, `request_timeout=20` confirmed in source

---

## Self-Check: PASSED

- [x] `app/agent/nodes/generation.py` — modified, accents and singleton tuning confirmed
- [x] `tests/test_agent/test_nodes/test_generation.py` — 3 new tests appended
- [x] Commit d6102c3 — exists (Task 1)
- [x] Commit 0e9bedc — exists (Task 2)
- [x] Commit 5789530 — exists (Task 3)
- [x] 332 tests passed

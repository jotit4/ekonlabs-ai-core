---
phase: "06"
plan: "02"
subsystem: "rag"
tags: ["rag", "generation", "multi-turn", "confidence-gate", "tdd"]
dependency_graph:
  requires: ["06-01"]
  provides: ["RAG-02", "RAG-05"]
  affects: ["generation_node", "rag_retrieval_node", "conversation_flow"]
tech_stack:
  added: []
  patterns: ["TDD red-green", "multi-turn context concatenation"]
key_files:
  created:
    - tests/test_agent/test_nodes/test_rag_retrieval.py
  modified:
    - app/agent/nodes/generation.py
    - tests/test_agent/test_nodes/test_generation.py
    - app/agent/nodes/rag_retrieval.py
decisions:
  - "Kept LOW_CONFIDENCE_PAUSE_RESPONSE and DEFAULT_CONFIDENCE_THRESHOLD constants for Phase 9 reuse"
  - "Multi-turn query joins last 2 human messages in chronological order (reversed(last_2_human))"
metrics:
  duration: "~15 min"
  completed: "2026-04-04T16:24:20Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 06 Plan 02: Remove Confidence Gate + Multi-Turn RAG Query Summary

**One-liner:** Removed binary is_paused confidence gate so empty RAG proceeds to LLM, and rag_retrieval_node now builds queries from last 2 human turns for better follow-up handling.

## What Was Built

### RAG-02: Remove binary confidence gate (Task 1)

The `generation_node` previously short-circuited with `is_paused=True` and `LOW_CONFIDENCE_PAUSE_RESPONSE` whenever `rag_context` was empty. This blocked the LLM from answering general questions not covered by the knowledge base.

Deleted the entire confidence evaluation block:
```python
# REMOVED:
confidence_score: float = 1.0 if rag_context else 0.0
if confidence_score < DEFAULT_CONFIDENCE_THRESHOLD:
    return {"messages": [...], "is_paused": True, ...}
```

Replaced with a comment. Constants `LOW_CONFIDENCE_PAUSE_RESPONSE` and `DEFAULT_CONFIDENCE_THRESHOLD` are preserved for Phase 9.

Empty `rag_context` now falls through to the LLM with the system prompt only — no RAG section injected into the SystemMessage.

### RAG-05: Multi-turn query in rag_retrieval_node (Task 2)

Replaced single-message query extraction with a 2-message accumulator that walks conversation history in reverse, collects up to 2 human turns, then joins them in chronological order:

```python
last_2_human: list[str] = []
for msg in reversed(messages):
    if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
        last_2_human.append(msg.content)
        if len(last_2_human) == 2:
            break
query = " ".join(reversed(last_2_human)).strip()
```

A follow-up like "y cuanto sale?" now produces a combined query `"me interesa la ortodoncia y cuanto sale"` that retrieves relevant pricing chunks instead of missing them.

## Tests

### test_generation.py (30 total, +3 new, 3 updated)

Updated tests:
- `test_generation_node_no_rag_injection_when_rag_present_but_empty_section` — flipped to assert LLM called
- `test_generation_node_low_confidence_when_no_rag_returns_pause_response` — flipped to assert LLM called
- `test_generation_node_low_confidence_when_empty_rag_returns_pause_response` — flipped to assert LLM called

New tests:
- `test_empty_rag_context_calls_llm_not_pause` — exact call_count == 1 assertion
- `test_empty_rag_context_does_not_include_rag_section` — SystemMessage lacks "Información de la Clínica"
- `test_no_rag_context_key_calls_llm` — state without rag_context key proceeds to LLM

### test_rag_retrieval.py (5 new)

- `test_rag_retrieval_uses_last_two_human_messages` — combined query contains both turns
- `test_rag_retrieval_single_message_works` — 1 message uses that message as query
- `test_rag_retrieval_uses_only_human_messages` — AI content excluded from query
- `test_rag_retrieval_empty_messages_returns_empty_rag_context` — no messages → rag_context=""
- `test_rag_retrieval_passes_combined_query_to_search_tool` — called with `{"query": combined}`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `app/agent/nodes/generation.py` — confidence gate block removed, constants kept
- `app/agent/nodes/rag_retrieval.py` — multi-turn accumulator implemented
- `tests/test_agent/test_nodes/test_generation.py` — 30 tests pass
- `tests/test_agent/test_nodes/test_rag_retrieval.py` — 5 tests pass
- Task 1 commit: cd43016
- Task 2 commit: eb14254
- Total: 35/35 tests pass

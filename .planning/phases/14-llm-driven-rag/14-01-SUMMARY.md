---
phase: 14-llm-driven-rag
plan: "01"
status: complete
completed_at: 2026-04-05
---

# Summary — Plan 14-01: LLM-Driven RAG via Tool Calling

## What was done
- Made `rag_retrieval_node` a complete no-op returning `{}` — graph edge preserved, RAG behavior moved inline
- Added `make_search_tool` import and `ToolMessage` import to `generation_node`
- General path now uses `_llm.bind_tools([search_tool], tool_choice="required")` to force LLM to call `search_knowledge_tool`
- Inline tool execution: after first LLM call, extracts tool_calls, calls `search_tool.invoke(args)`, builds `ToolMessage`, sends to LLM for final response
- Empty tool result becomes `"Sin resultados."` ToolMessage content (RAG-04)
- Fixed `MagicMock.tool_calls` truthy-ness bug: guard `isinstance(tool_calls, list) and tool_calls` prevents MagicMock from being treated as a real tool call in tests
- Rewrote all 5 `test_rag_retrieval.py` tests to verify no-op behavior (make_search_tool never called, returns {})
- Updated `_make_mock_llm` in test_generation.py to wire bind_tools chain
- Added 3 new RAG tests: test_rag01_clinic_question_triggers_tool_call_and_tool_message, test_rag03_general_path_uses_tool_choice_required, test_rag04_empty_tool_result_becomes_sin_resultados_message
- Fixed test_graph.py: updated _mock_llm() bind_tools chain, fixed test_graph_booking_confirm_bypasses_scheduling_and_rag

## Requirements satisfied
- RAG-01 ✓ — clinic question causes LLM to call search_knowledge_tool; ToolMessage appears in messages
- RAG-02 ✓ — rag_retrieval_node returns {} without calling make_search_tool; graph edge preserved
- RAG-03 ✓ — general path uses tool_choice="required" (not "auto")
- RAG-04 ✓ — empty tool result becomes "Sin resultados." ToolMessage

## Tests
- rag_retrieval tests: 5/5 pass (full rewrite)
- generation tests: 54/54 pass (3 new RAG tests added)
- graph tests: all pass after _mock_llm fix
- Full suite: 262 pass (excluding 2 pre-existing failures in test_webhooks.py and test_rag.py)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MagicMock.tool_calls truthy causes real tool validation error in tests**
- **Found during:** Task 3 (test run after generation.py changes)
- **Issue:** `getattr(MagicMock(), "tool_calls", None)` returns another MagicMock (truthy). Code entered the tool execution branch and called `search_knowledge_tool.invoke(MagicMock_args)` which triggered Pydantic ValidationError
- **Fix:** Changed `if tool_calls:` to `if isinstance(tool_calls, list) and tool_calls:` — MagicMock is not a list, so the guard correctly skips the branch
- **Files modified:** app/agent/nodes/generation.py

## Commit
- `fb834e6`: feat(phase-14): LLM-driven RAG via inline tool calling (RAG-01/02/03/04)

## Self-Check: PASSED
- app/agent/nodes/rag_retrieval.py — returns {}, no make_search_tool call
- app/agent/nodes/generation.py — bind_tools + inline tool execution in general path
- tests/test_agent/test_nodes/test_rag_retrieval.py — full rewrite, 5/5 pass
- tests/test_agent/test_nodes/test_generation.py — 3 new RAG tests pass
- tests/test_agent/test_graph.py — bind_tools chain wired, booking confirm test fixed

---
phase: 13-llm-generated-responses
plan: "02"
status: complete
completed_at: 2026-04-05
---

# Summary — Plan 13-02: LLM-Generated Responses (Wave 2 — RAG context removal)

## What was done
- Removed `rag_context` XML injection from `generation_node` general path — Phase 14 (tool calling) supersedes it
- Removed `<clinic_knowledge>` XML block and anti-injection instruction from `_build_scheduling_context` and general path system prompt construction
- Rewrote 6 existing RAG-context tests (XML delimiter tests) to reflect Phase 14 behavior: no XML in system messages, bind_tools path verified instead
- Updated `_make_mock_llm` helper to wire up `mock.bind_tools.return_value.invoke.return_value` chain for general path tests
- Updated all general-path test assertions from `mock_llm.invoke.call_args` to `mock_llm.bind_tools.return_value.invoke.call_args`

## Requirements satisfied
- RESP-01 through RESP-07 ✓ — all preserved from 13-01 (this plan only removes obsolete RAG injection, no behavior regression)

## Tests
- Generation tests: 54/54 pass after all updates
- RAG XML delimiter tests rewritten: test_no_rag_context_key_calls_llm, test_rag_context_wrapped_in_xml_delimiters, test_rag_context_xml_contains_the_content, test_rag_context_injection_includes_anti_injection_instruction, test_rag_context_old_markdown_header_absent, test_empty_rag_context_no_xml_tags — all repurposed for Phase 14 validation

## Deviations from Plan

None — plan executed as written.

## Commit
- `e4c8e3d`: feat(phase-13): route booking+scheduling intents through LLM (RESP-01/02/03/04/05/06/07)

## Self-Check: PASSED
- app/agent/nodes/generation.py — no XML rag_context injection in any path
- tests/test_agent/test_nodes/test_generation.py — bind_tools chain wired in _make_mock_llm, all 54 tests pass

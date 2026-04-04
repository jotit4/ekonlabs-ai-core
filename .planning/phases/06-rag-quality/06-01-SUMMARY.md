---
plan: "06-01"
phase: "06-rag-quality"
status: completed
completed_at: 2026-04-04
subsystem: rag
tags: [rag, similarity-threshold, deduplication, chunk-size, search-tool]
dependency_graph:
  requires: []
  provides: [rag-quality-fixes]
  affects: [app/services/rag_service.py, app/agent/tools/search_tool.py]
tech_stack:
  added: []
  patterns: [TDD red-green, similarity threshold filtering, delete-before-insert]
key_files:
  created:
    - tests/test_agent/test_tools/__init__.py
    - tests/test_agent/test_tools/test_search_tool.py
  modified:
    - app/services/rag_service.py
    - app/agent/tools/search_tool.py
    - tests/test_services/test_rag.py
decisions:
  - "Similarity threshold set to 0.60 (inclusive) — filters irrelevant chunks before prompt injection"
  - "DELETE-before-INSERT in same transaction block — prevents duplicate chunks on re-upload"
  - "Chunk size reduced 1000->400, overlap 200->60 — improves FAQ precision for short clinic content"
  - "search_tool returns '' not Spanish fallback — LLM decides how to handle missing context"
metrics:
  duration: "~8 minutes"
  completed_date: 2026-04-04
  tasks_completed: 2
  files_changed: 5
---

# Phase 06 Plan 01: RAG Data Quality Fixes Summary

**One-liner:** Similarity threshold 0.60 + delete-before-insert deduplication + chunk size 400/60 for FAQ-optimized RAG pipeline.

## Changes made

- `app/services/rag_service.py`:
  - Added `_SIMILARITY_THRESHOLD: float = 0.60` constant after existing constants
  - Filtered `search_knowledge` return list to exclude rows with `similarity < 0.60` (inclusive at 0.60)
  - Added `DELETE FROM public.knowledge_chunks WHERE tenant_id = %s AND source_filename = %s` before INSERT loop in `ingest_document` — both in the same transaction block
  - `_CHUNK_SIZE` changed from 1000 to 400
  - `_CHUNK_OVERLAP` changed from 200 to 60

- `app/agent/tools/search_tool.py`:
  - Changed empty-results return from `"No se encontró información relevante en la base de conocimiento."` to `""` — the LLM handles missing context rather than receiving a hardcoded Spanish string

## Tests added

**`tests/test_agent/test_tools/test_search_tool.py`** (new file, 3 tests):
- `test_search_tool_returns_empty_string_when_no_results`
- `test_search_tool_returns_empty_string_not_spanish_fallback`
- `test_search_tool_joins_content_when_results_present`

**`tests/test_services/test_rag.py`** (6 tests added):
- `test_search_knowledge_filters_below_threshold`
- `test_search_knowledge_returns_empty_list_when_all_below_threshold`
- `test_search_knowledge_includes_chunk_at_exactly_threshold`
- `test_ingest_deletes_existing_chunks_before_insert`
- `test_ingest_delete_uses_correct_params`
- `test_chunk_size_constant_is_400`
- `test_chunk_overlap_constant_is_60`

## Verification

All 15 tests pass (12 in test_rag.py + 3 in test_search_tool.py). All 4 pre-existing tests still pass. Constants verified: `_CHUNK_SIZE=400`, `_CHUNK_OVERLAP=60`, `_SIMILARITY_THRESHOLD=0.60`. DELETE precedes INSERT in ingest_document.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `app/services/rag_service.py` — modified, verified constants and logic
- `app/agent/tools/search_tool.py` — modified, empty return fixed
- `tests/test_agent/test_tools/__init__.py` — created
- `tests/test_agent/test_tools/test_search_tool.py` — created
- `tests/test_services/test_rag.py` — modified with new tests
- Commit `353f9bb` — Task 1 (threshold + search_tool)
- Commit `bcbc60a` — Task 2 (delete-before-insert + chunk size)

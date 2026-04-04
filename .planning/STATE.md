# STATE — ekonlabs-ai-core

## Project Reference

**Project:** ekonlabs-ai-core
**Core Value:** A patient writes on WhatsApp at 11pm. The agent responds immediately, answers questions about services, and books an appointment directly into the clinic's Google Calendar.
**Active Milestone:** v1.1 Production Hardening
**Current Focus:** Fix audit findings to deploy for first paying client (ISADI)

---

## Current Position

**Current Phase:** 6 — RAG Quality (in progress)
**Current Plan:** 06-02 (06-01 complete)
**Phase Status:** In progress
**Milestone Status:** In progress

```
Progress: [███░░░░░░░] 30% — 1 of 5 phases complete, phase 6 in progress
```

---

## Phase Sequence

| # | Phase | Status |
|---|-------|--------|
| 5 | Intent Detection Fixes | Complete |
| 6 | RAG Quality | Planned |
| 7 | Infrastructure Reliability | Not started |
| 8 | Security & Configuration | Not started |
| 9 | Copy & LLM Settings | Not started |

---

## Performance Metrics

- Requirements mapped: 25/25
- Phases defined: 5
- Plans written: 6
- Plans complete: 3

---

## Accumulated Context

### Key Decisions

- Phase numbering starts at 5 (v1.0 ended at Phase 4)
- Brownfield hardening only — no new features in this milestone
- Phase order: intent first (most demo-visible), then RAG, infra, security, copy last
- Copy and LLM tuning (Phase 9) depends on Phase 5 (correct routing must exist before copy is finalized)
- [05-01] Used space-padded query matching to prevent "va" from false-matching inside "reservar"
- [05-01] Did NOT add "ardor de" to triage keywords — would match "ardor de estomago"; used "ardor en" instead
- [05-01] Renamed _has_scheduling_intent → has_scheduling_intent (public) for future graph.py import
- [05-02] Phrase keys "el N" moved from PHRASE_KEYS to separate regex check with word-boundary to prevent "el 2" matching "el 21"
- [05-02] _detect_slot_index returns None (not 0) on no match — callers must handle None explicitly
- [05-03] _route_after_anti_diagnostic checks has_scheduling_intent before returning "generation" — scheduling intent takes precedence over is_medical_query
- [05-03] handoff_node returns {} — does not mutate state; notification_service remains deferred stub
- [05-03] Test phrase "tengo fiebre sin querer turno" replaced with "tengo fiebre alta desde ayer" because "turno" is a scheduling keyword
- [06-01] _SIMILARITY_THRESHOLD = 0.60 added to rag_service.py; search_knowledge filters rows below threshold
- [06-01] search_tool returns "" (not Spanish fallback string) when results are empty — generation_node sees rag_context="" and decides independently
- [06-01] ingest_document issues DELETE WHERE tenant_id=%s AND source_filename=%s before INSERT — same transaction, atomic
- [06-01] _CHUNK_SIZE reduced from 1000 to 400; _CHUNK_OVERLAP from 200 to 60
- [06-02] Binary confidence score block removed from generation_node — empty rag_context no longer sets is_paused=True
- [06-02] rag_retrieval_node builds query from last 2 human messages (not just latest) for follow-up handling
- [06-03] RAG context injected with XML delimiters <clinic_knowledge> and explicit anti-injection instruction

### Active Constraints

- Argentine Spanish (voseo) required for all patient-facing copy
- Anti-diagnostic guardrail is non-negotiable — must not be weakened by any fix
- Multi-tenant isolation must be preserved across every change
- 1-week timeline (5 working days, ~1 day per phase)

### Blockers

None.

### Notes

- ISADI is the first paying client — this milestone gates the first real deployment
- Phase 5 complete: 3 plans executed (05-01 keyword fixes, 05-02 slot ambiguity, 05-03 graph routing + handoff)
- RAG-02 fix changes agent behavior when no context is found — must not introduce false positives
- Phase 6 plans: 06-01 (threshold+dedup+chunk size), 06-02 (confidence fix+multi-turn), 06-03 (XML injection hardening)
- 06-01 and 06-02 are Wave 1 (independent); 06-03 is Wave 2 (depends on 06-02 for generation.py state)

---

## Session Continuity

**Last session:** 2026-04-04 — Completed 06-01 (RAG Data Quality Fixes): similarity threshold, delete-before-insert, chunk size 400/60, search_tool empty return
**Resume from:** `/gsd:execute-phase 6` (next: 06-02)

---

*Last updated: 2026-04-04 | v1.1 Production Hardening*

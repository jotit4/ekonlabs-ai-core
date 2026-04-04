# STATE — ekonlabs-ai-core

## Project Reference

**Project:** ekonlabs-ai-core
**Core Value:** A patient writes on WhatsApp at 11pm. The agent responds immediately, answers questions about services, and books an appointment directly into the clinic's Google Calendar.
**Active Milestone:** v1.1 Production Hardening
**Current Focus:** Fix audit findings to deploy for first paying client (ISADI)

---

## Current Position

**Current Phase:** 5 — Intent Detection Fixes (complete)
**Current Plan:** None (phase complete)
**Phase Status:** Complete
**Milestone Status:** In progress

```
Progress: [██░░░░░░░░] 20% — 1 of 5 phases complete
```

---

## Phase Sequence

| # | Phase | Status |
|---|-------|--------|
| 5 | Intent Detection Fixes | Complete |
| 6 | RAG Quality | Not started |
| 7 | Infrastructure Reliability | Not started |
| 8 | Security & Configuration | Not started |
| 9 | Copy & LLM Settings | Not started |

---

## Performance Metrics

- Requirements mapped: 25/25
- Phases defined: 5
- Plans written: 3
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

---

## Session Continuity

**Last session:** 2026-04-04 — Phase 5 executed (all 3 plans complete)
**Resume from:** `/gsd:plan-phase 6`

---

*Last updated: 2026-04-04 | v1.1 Production Hardening*

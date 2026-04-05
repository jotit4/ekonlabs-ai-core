# STATE — ekonlabs-ai-core

## Project Reference

**Project:** ekonlabs-ai-core
**Core Value:** A patient writes on WhatsApp at 11pm. The agent responds immediately, answers questions about services, and books an appointment directly into the clinic's Google Calendar.
**Active Milestone:** v1.2 Human-Feeling Agent
**Current Focus:** Make the agent feel human — LLM-generated responses, patient name collection, LLM-driven RAG via tool calling, full character brief system prompt

---

## Current Position

**Current Phase:** Phase 11 — System Prompt & Model (not started)
**Current Plan:** —
**Phase Status:** Not started
**Milestone Status:** In progress — v1.2 started 2026-04-05

```
Progress: [░░░░░░░░░░] 0% — 0 of 5 phases complete
```

---

## Phase Sequence

| # | Phase | Status |
|---|-------|--------|
| 5 | Intent Detection Fixes | Complete |
| 6 | RAG Quality | Complete |
| 7 | Infrastructure Reliability | Complete |
| 8 | Security & Configuration | Complete |
| 9 | Copy & LLM Settings | Complete |
| 10 | Evolution API Integration | Complete |
| 11 | System Prompt & Model | Not started |
| 12 | State Schema Extension | Not started |
| 13 | LLM-Generated Responses | Not started |
| 14 | LLM-Driven RAG via Tool Calling | Not started |
| 15 | Patient Name Collection | Not started |

---

## Performance Metrics

- Requirements mapped: 22/22
- Phases defined: 5 (v1.2)
- Plans written: 0
- Plans complete: 0

---

## Accumulated Context

### Key Decisions

- Phase numbering starts at 11 (v1.1 ended at Phase 10)
- Build order follows architectural risk gradient: prompt/model (no risk) → state schema (no behavior change) → generation restructure (medium risk) → tool binding (medium risk) → name collection (highest complexity, goes last)
- graph.py topology must NOT change — all v1.2 changes live in nodes and state
- Anti-diagnostic and shadow mode bypasses stay hardcoded — they are hard gates that must be reached before any LLM call, regardless of persona strength
- Inline tool execution chosen over ToolNode graph node to avoid graph topology changes
- RESP-06 and RESP-07 (hardcoded stays) are in Phase 13 as explicit confirmation that those paths are preserved during the generation_node restructure
- NAME-01 is Phase 12 (isolated state schema change) — separated from NAME-02 through NAME-07 (Phase 15) because schema must exist before name collection logic is built
- LLM temperature changed from 0.3 to 0.5 for natural phrasing variability
- Model changed from gpt-4o-mini to gpt-4.1-mini (same cost tier, 30% better tool calls, stronger instruction-following)
- RAG pre-fetch node becomes a no-op (returns {}) — graph edge preserved, behavior moved to inline tool call in generation_node
- Patient name collection uses 2-turn flow: Turn 1 = booking_node defers + generation_node asks for name; Turn 2 = generation_node captures name + calls calendar_service.create_event() inline
- After 2 failed name captures, is_paused=True routes to human handoff
- slot_presented_at enables 30-minute TTL check to prevent stale slot confirmation

### Active Constraints

- Argentine Spanish (voseo) required for all patient-facing copy
- Anti-diagnostic guardrail is non-negotiable — must not be weakened by any change
- Multi-tenant isolation must be preserved — make_search_tool(tenant_id) remains the only tenant injection point
- 1-week timeline (5 working days, ~1 day per phase)
- No new pip packages required — all tooling ships in already-installed langgraph and langchain-openai
- langgraph must be re-pinned to >=1.0.0 (current loose pin hides breaking default change in handle_tool_errors)

### Open Product Questions (require client or product input before Phase 11)

1. Agent name and persona — What is the agent's name? (e.g. Valentina, Camila) This gates the system prompt redesign.
2. Patient name requirement — First name only, or first + last? What happens if patient gives only a first name?
3. Name confirmation step — Should the agent confirm the name back before creating the calendar event, or is single-collection sufficient?
4. Tone register — Informal-warm voseo or slightly more formal? Determines several prompt decisions.
5. Slot TTL threshold — Research recommends 30 minutes (per REQUIREMENTS.md NAME-07). Confirm with clinic.

### Blockers

None — roadmap defined, ready to plan Phase 11.

### Notes

- v1.1 Production Hardening complete (14/14 plans, all 6 phases 5-10 done as of 2026-04-05)
- ISADI is the first paying client — v1.2 gates the human-feeling demo for client approval
- Phase 13 is the highest-risk phase — audit all existing generation_node tests before writing any production code (ARCHITECTURE.md Risk 7)
- Phase 15 introduces calendar operations in generation_node — wrap in try/except; log as response_type="booking_from_generation"

---

## Session Continuity

**Last session:** 2026-04-05 — v1.2 roadmap defined (22/22 requirements mapped, 5 phases 11–15)
**Resume from:** Phase 11 — System Prompt & Model — run /gsd:plan-phase 11

---

*Last updated: 2026-04-05T00:00:00Z | v1.2 Human-Feeling Agent — ROADMAP DEFINED*

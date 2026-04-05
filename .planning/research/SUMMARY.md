# Research Summary — v1.2 Human-Feeling Agent

**Synthesized:** 2026-04-04
**Sources:** STACK.md (HIGH confidence), FEATURES.md (MEDIUM-HIGH), ARCHITECTURE.md (HIGH), PITFALLS.md (HIGH)

---

## Stack Additions

**No new pip packages.** All required tooling (ToolNode, InjectedState, tools_condition, bind_tools) ships inside the already-installed `langgraph` and `langchain-openai` packages.

Two changes are required:

| Change | What | Why |
|--------|------|-----|
| Re-pin `langgraph` | `>=0.0.15` → `>=1.0.0` | LangGraph 1.0.1+ changed `handle_tool_errors` default to `False`; current loose pin hides this |
| **Swap model** | `gpt-4o-mini` → `gpt-4.1-mini` | One-line change in `generation.py`; same cost tier; 30% better tool calls; stronger instruction-following for voseo/persona. Community reports show gpt-4o-mini has an increasing function-call failure rate, which directly threatens the tool-calling RAG feature. |

**What to explicitly avoid adding:** `AgentExecutor`, `create_react_agent`, LangGraph `interrupt()` + checkpointer, LangSmith SDK, streaming (`astream`), more than 2 tools bound to generation LLM.

---

## Feature Table Stakes

### System Prompt / Persona
- Named agent identity (not "asistente virtual") — a human name + role declaration from the agent's own perspective
- Voseo rioplatense enforced via directives, not adjectives — e.g. "Hablá de vos a vos. Frases cortas."
- Hard guardrails listed with priority: "Las RESTRICCIONES ABSOLUTAS siempre ganan."
- Escalation protocol explicit — when to hand off, stated up front
- Response length rule: 1–3 sentences, no bullets, no headers in patient-facing output
- Under 800 tokens total — instructions in the "lost in the middle" zone (tokens 500–1500) are under-attended by gpt-4o-mini

### LLM-Generated Responses
- Every patient-facing string goes through the LLM — no split voice (warm FAQ + templated confirmation = broken immersion)
- Booking/scheduling data injected as structured XML context blocks, never as free-form text the LLM reformulates
- Booking date/time surfaced via `booked_slot["display"]` injected verbatim inside `<turno_confirmado>` tags — LLM wraps persona language *around* the literal, never rewrites it
- Temperature: 0.5–0.7 for natural variability (current 0.3 is below the threshold for natural phrasing)

### Patient Name Collection
- Ask once, at booking commit time only — never as the first message
- Single ask: "¿Me decís tu nombre y apellido para completar la reserva?"
- `patient_name: str | None` added to `ConversationState`; persists for session
- `patient_name_requested: bool` prevents re-asking
- `booking_pending_confirmation: bool` carries the continuation signal across turns
- Two-turn flow: Turn 1 = ask name, Turn 2 = `generation_node` captures name + triggers calendar event inline
- After 2 failed captures, proceed with phone number as identifier and flag for staff

### LLM-Driven RAG via Tool Calling
- Tool description must state exactly what the knowledge base contains; LLM needs to know when to call it
- Force tool call for first LLM turn on non-booking, non-scheduling messages: `tool_choice={"type": "function", "function": {"name": "search_knowledge_tool"}}` — do not rely on `tool_choice="auto"` in medical context
- If tool returns empty, LLM says "no tengo esa información" — never hallucinate clinic data
- One tool call per turn maximum; disable `parallel_tool_calls`

### Natural Slot Presentation
- No emoji-numbered lists (`1️⃣ 2️⃣ 3️⃣`) — single most recognized chatbot signature on WhatsApp
- Slots injected as `<opciones_de_turno>1. {display}\n2. {display}\n3. {display}</opciones_de_turno>` — LLM adds language around the block, never reformats the numbered references
- `_detect_slot_index` in `booking_node` remains the authoritative slot parser

### Conversational Guidance (proactive steering)
- Offer booking naturally embedded in the closing sentence of FAQ answers — not appended as a separate line
- Offer once per conversation — not repeated if patient redirects
- Urgency-sensitive steering: when empathy_mode is urgent, language matches the urgency level
- Entirely prompt-driven once LLM owns all output — no new nodes required

---

## Architecture Approach

### What Does NOT Change
Graph topology (`graph.py`), `triage_node`, `anti_diagnostic_node`, `scheduling_node`, all `_route_after_*` routing functions, shadow mode bypass in `generation_node`, anti-diagnostic bypass in `generation_node`, `make_search_tool` factory, `add_messages` reducer.

**The two deterministic bypasses (shadow, anti-diagnostic) must remain hard code gates that never call the LLM.** This is non-negotiable regardless of persona strength.

### What Changes (Surgical)

| Component | Change |
|-----------|--------|
| `state.py` | Add 3 `NotRequired` fields: `patient_name`, `patient_name_requested`, `booking_pending_confirmation` |
| `generation.py` | Core refactor: booking + scheduling paths become LLM context injection via `_build_generation_context()` helper |
| `generation.py` | Inline tool binding for RAG path: `_llm.bind_tools([search_knowledge_tool])` + one-cycle tool execution loop |
| `generation.py` | Name-capture gate: when `booking_pending_confirmation=True` and `patient_name` absent, capture name from latest message + call `calendar_service.create_event()` inline |
| `rag_retrieval_node` | Returns `{"rag_context": ""}` (no-op); graph edge preserved, node emptied |
| `booking_node` | Defers event creation when `patient_name` absent; sets `booking_pending_confirmation=True` |
| `calendar_service.create_event()` | Accept optional `patient_name` param; use in event title |

### Build Order (from ARCHITECTURE.md)

1. **State schema extension** — add 3 `NotRequired` fields; all existing tests pass unchanged
2. **`generation_node` restructure — booking + scheduling paths** — replace hardcoded strings with LLM context injection; audit and update all affected unit tests first
3. **Tool binding for RAG path** — bind `search_knowledge_tool`, inline execution, make `rag_retrieval_node` a no-op
4. **Patient name collection** — `booking_node` deferral + `generation_node` name-capture + inline booking
5. **`calendar_service` patient name passthrough** — update event creation signature and title

### Key Technical Decision: Inline Tool Execution

Tool calling is handled inline inside `generation_node`, not via a `ToolNode` graph node. This avoids touching `graph.py` (no new nodes, no new conditional edges). The tradeoff is reduced node-level observability, but `ToolMessage` entries in `state["messages"]` provide full audit trail. Single tool call cycle cap prevents runaway loops.

---

## Watch Out For

These are the top 5 pitfalls from PITFALLS.md that can cause production failures or broken experiences:

1. **LLM fabricates appointment date/time in confirmation** — inject `booked_slot["display"]` inside a `<turno_confirmado>` XML tag and instruct the LLM to reproduce it verbatim. Add an integration test asserting the exact display string appears character-for-character in every booking confirmation response.

2. **Booking keywords fire during name collection (`listo, me llamo Juan`)** — add `name_collection_active: bool` state guard in `booking_node`; when `True`, return `{"booking_intent": False}` immediately before any keyword matching.

3. **Anti-diagnostic guardrail bypassed by persona instructions** — the anti-diagnostic bypass in `generation_node` is a hard code gate; it must be reached before any LLM call. Add explicit priority declaration at the top of the system prompt. Run anti-diagnostic regression tests before deploying any prompt change.

4. **Stale slots cause double booking during name collection dialog** — add `slots_fetched_at` timestamp to `ConversationState`; validate TTL (< 60 seconds) in `booking_node` before creating the calendar event. If stale, re-fetch and check slot is still available.

5. **gpt-4o-mini skips tool call and answers from training data** — use forced `tool_choice` (not `auto`) for knowledge queries. Keep pre-injection RAG as fallback during transition. Never trust `tool_choice="auto"` in a medical context where hallucinated clinic data causes real patient harm.

---

## Open Questions (product decisions needed)

These cannot be resolved by architecture or research alone — they require client or product input before building:

1. **Agent name and persona** — What is the agent's name? (e.g., Valentina, Camila, Sofía) This gates the entire system prompt redesign. Is there an existing name from ISADI or is this to be defined?

2. **How much patient name is required?** — First name only, or first + last? What happens if the patient provides only a first name — is the calendar event still created? Research says accept first name only, but the clinic may have a preference.

3. **Name confirmation step** — Should the agent confirm the name back to the patient ("Perfecto, te anoto como Lucía González, ¿es correcto?") before creating the calendar event, or is a single collection step sufficient? Adding confirmation improves accuracy but adds one turn.

4. **Tone register level** — The research recommends informal-warm voseo (young, friendly clinic employee). Is this the right register for ISADI's patient demographic, or does the clinic prefer a slightly more formal tone? This determines several specific prompt decisions.

5. **Slot TTL threshold** — 60 seconds is the research recommendation for `slots_fetched_at` TTL. Does the clinic operate at concurrency levels that justify a shorter window (e.g., 30 seconds), or is 60 seconds operationally safe given their typical appointment volume?

6. **Escalation trigger** — When should the agent explicitly hand off to a human staff member? The research requires this to be defined explicitly in the system prompt. Current code has no escalation path — is this in scope for v1.2 or a later milestone?

# Architecture Research — v1.2 Human-Feeling Agent

**Researched:** 2026-04-04
**Confidence:** HIGH (analysis based on actual codebase + verified LangGraph patterns)

---

## Summary of Changes

### What stays exactly as-is (non-negotiable)

| Component | Reason to keep |
|-----------|---------------|
| `triage_node` | No changes needed |
| `anti_diagnostic_node` | Deterministic guardrail — unchanged |
| `booking_node` (keyword detection + calendar ops) | Deterministic guardrail — unchanged |
| `scheduling_node` (keyword detection + calendar fetch) | Deterministic guardrail — unchanged |
| All four `_route_after_*` functions in `graph.py` | Routing logic unchanged |
| Shadow mode bypass in `generation_node` | Stays deterministic, returns hardcoded string |
| Anti-diagnostic bypass in `generation_node` | Stays deterministic, returns hardcoded string |
| `ConversationState.messages` reducer (`add_messages`) | Unchanged |
| Graph topology in `graph.py` | No new edges or nodes required |
| `make_search_tool` factory in `search_tool.py` | Unchanged — multi-tenant isolation contract preserved |

### What changes (surgical)

| Component | Nature of change |
|-----------|-----------------|
| `generation_node` | Core refactor: booking/scheduling paths become LLM context injection instead of hardcoded Python strings |
| `rag_retrieval_node` | Becomes a pass-through no-op; LLM calls `search_knowledge_tool` directly via tool binding |
| `ConversationState` | 3 new fields for patient name collection multi-turn flow |
| `booking_node` | Minor addition: defer calendar event creation when `patient_name` absent; set `booking_pending_confirmation=True` |

---

## New State Fields

Add to `ConversationState` TypedDict in `app/agent/state.py`:

```python
patient_name: NotRequired[str | None]
# Collected before booking confirmation. None = not yet asked. Non-empty string = known.

patient_name_requested: NotRequired[bool]
# True after the agent has already asked for the name in this conversation.
# Prevents re-asking in subsequent turns if patient ignores the question.

booking_pending_confirmation: NotRequired[bool]
# Set by booking_node when confirm intent is detected but patient_name is absent.
# generation_node uses this to trigger name collection instead of confirming booking.
```

**Design note:** `patient_name_requested` and `booking_pending_confirmation` are transient flags that reset naturally across conversation sessions because the full state is rebuilt from Supabase on each worker invocation. No explicit cleanup logic is needed.

---

## Modified Components

| Component | Current behavior | New behavior |
|-----------|-----------------|-------------|
| `generation_node` — execution paths | 5 paths: shadow, anti-diag, booking (hardcoded), scheduling (hardcoded), LLM+RAG | 3 paths: shadow (stays hardcoded), anti-diag (stays hardcoded), LLM for everything else |
| `generation_node` — booking confirmed path | Python f-string `BOOKING_CONFIRMED_TEMPLATE.format(display=...)` returned directly | LLM receives structured `<booking_context>` block; writes natural confirmation response |
| `generation_node` — booking ambiguous path | Hardcoded "No pude identificar cuál turno..." string | LLM receives `booking_ambiguous_slot=True` context; writes clarification naturally |
| `generation_node` — scheduling path | Hardcoded slot list with emoji numbers | LLM receives `<scheduling_context>` block with slot list; writes natural presentation |
| `generation_node` — patient name gate | Does not exist | When `booking_pending_confirmation=True` and `patient_name` absent: LLM is invoked with instruction to ask for name before confirming the slot |
| `generation_node` — RAG path | Reads `rag_context` pre-filled by upstream `rag_retrieval_node`; injects into system message | Binds `search_knowledge_tool`; LLM decides when to call it; result returned as `ToolMessage` before final response |
| `rag_retrieval_node` | Fetches RAG context, stores in `state["rag_context"]` | Becomes identity function returning `{}`. The `rag_retrieval → generation` edge in `graph.py` is preserved (no graph topology change), but the node does nothing. |
| `booking_node` — event creation | Creates Google Calendar event unconditionally on confirm intent | Checks `state.get("patient_name")` first; if absent, sets `booking_pending_confirmation=True` and returns WITHOUT creating the event |
| `booking_node` — event title | Creates event with `phone_number` only | Passes `patient_name` to `calendar_service.create_event()` when available |

---

## New Components

No new graph nodes. No new files required.

**New internal helper: `_build_generation_context(state: ConversationState) -> str`**

Private function inside `generation.py`. Centralizes all structured context assembly that currently lives as inline if/else chains. Returns an XML-delimited block appended to the system message.

Outputs one of the following context blocks depending on state:

**Booking pending name collection:**
```xml
<booking_context>
action: confirm_pending_name
slot_index: 1
slot: Martes 8 de abril, 14:00 - 14:30
patient_name_requested: false
</booking_context>
```

**Booking confirmed:**
```xml
<booking_context>
action: confirm
patient_name: María González
slot: Martes 8 de abril, 14:00 - 14:30
event_id: abc123xyz
</booking_context>
```

**Booking failed (no slots):**
```xml
<booking_context>
action: confirm
result: no_availability
</booking_context>
```

**Booking cancelled:**
```xml
<booking_context>
action: cancel
result: cancelled
</booking_context>
```

**Booking ambiguous slot:**
```xml
<booking_context>
action: confirm
result: ambiguous_slot_selection
available_count: 3
</booking_context>
```

**Scheduling — slots available:**
```xml
<scheduling_context>
available_slots:
  1. Lunes 7 de abril, 10:30 - 11:00
  2. Martes 8 de abril, 14:00 - 14:30
  3. Miércoles 9 de abril, 09:00 - 09:30
</scheduling_context>
```

**Scheduling — no slots:**
```xml
<scheduling_context>
available_slots: none
</scheduling_context>
```

The LLM receives these blocks as part of the system message and writes the natural-language response from them.

---

## Data Flow Changes

### Flow A: Scheduling (before and after)

**Before (v1.1):**
```
human: "quiero turno para mañana"
  triage → anti_diagnostic → booking_node (no intent)
  → scheduling_node (has intent, fetches slots)
      state: scheduling_intent=True, available_slots=[{...}, {...}, {...}]
  → generation_node
      scheduling bypass → Python constructs slot string → AIMessage returned
      LLM never called
```

**After (v1.2):**
```
human: "quiero turno para mañana"
  triage → anti_diagnostic → booking_node (no intent)
  → scheduling_node (has intent, fetches slots, unchanged)
      state: scheduling_intent=True, available_slots=[{...}, {...}, {...}]
  → generation_node
      _build_generation_context() → <scheduling_context> block
      _llm.bind_tools([search_knowledge_tool]).invoke([SystemMessage, *messages])
      LLM uses context block to phrase slot list naturally
      If LLM calls search_knowledge_tool → ToolNode executes → ToolMessage added
      Final AIMessage returned
```

### Flow B: Booking confirmation with patient name collection (new)

**Turn 1 — confirm without name:**
```
human: "dale, el 2"  (patient_name not in state)
  triage → anti_diagnostic → booking_node
      detects confirm intent + slot=1
      patient_name absent → sets booking_pending_confirmation=True
      does NOT call calendar_service.create_event()
      returns: {booking_intent: True, booking_action: "confirm",
                selected_slot_index: 1, booking_pending_confirmation: True,
                calendar_event_id: None}
  → generation_node
      booking_intent=True, booking_pending_confirmation=True
      context block: <booking_context action=confirm_pending_name slot=...>
      LLM called: writes "¡Perfecto! Para reservar el turno del martes 8 a las 14:00,
                  ¿me decís tu nombre completo?"
```

**Turn 2 — patient provides name:**
```
human: "María González"
  triage → anti_diagnostic → booking_node
      no confirm/cancel keywords detected → booking_intent=False
  → scheduling_node
      no scheduling keywords → scheduling_intent=False
  → rag_retrieval_node (no-op)
  → generation_node
      no booking_intent, no scheduling_intent
      patient_name_requested=True is in state, no booking_pending_confirmation
      BUT how does booking_node know "María González" is the name?
      → See Patient Name Collection Flow section for the resolution
```

### Flow C: RAG general query (before and after)

**Before (v1.1):**
```
human: "cuánto cuesta la consulta?"
  triage → anti_diagnostic → booking_node (no intent)
  → scheduling_node (no intent)
  → rag_retrieval_node
      fetches RAG context, stores in state["rag_context"]
  → generation_node
      rag_context injected into system message as <clinic_knowledge>
      LLM called with full pre-fetched context
```

**After (v1.2):**
```
human: "cuánto cuesta la consulta?"
  triage → anti_diagnostic → booking_node (no intent)
  → scheduling_node (no intent)
  → rag_retrieval_node (no-op, returns {})
  → generation_node
      no booking/scheduling context
      _llm.bind_tools([search_knowledge_tool]).invoke([SystemMessage, *messages])
      LLM generates tool call: search_knowledge_tool(query="precio consulta")
      ToolNode executes → returns ToolMessage with RAG results
      LLM sees ToolMessage, writes final answer
      Final AIMessage returned
```

**Trade-off note:** The tool-calling RAG path adds one LLM turn (tool call + result) vs. the pre-fetched approach. This increases latency by ~1-2s for general queries. Acceptable for conversational feel. The pre-fetch approach can be restored for specific paths if latency becomes a problem.

---

## Patient Name Collection Flow

The fundamental challenge is that "María González" arrives as a new human turn where `booking_node` sees no booking keywords. The state still has `booking_pending_confirmation=True` and `selected_slot_index=1` from the previous turn.

**Recommended approach: state-driven intake in `generation_node`**

`generation_node` detects `booking_pending_confirmation=True` on entry. It checks if `patient_name` is now present in state. If not, it checks the latest human message to see if it looks like a name (simple heuristic: no booking keywords, no medical keywords, non-empty string). If so, it writes `patient_name` to state and proceeds to trigger booking.

However, this means `generation_node` would need to call `booking_node`'s calendar creation logic, which violates separation of concerns.

**Cleaner approach: `triage_node` or a new `intake_node` sets `patient_name`**

Looking at the existing `intake.py` (currently a stub/TODO), this is its intended purpose. The flow becomes:

```
Turn 2: human: "María González"
  triage_node detects booking_pending_confirmation=True in state
      → extracts latest human message as candidate name
      → sets patient_name="María González" in state
  → anti_diagnostic (no medical query)
  → booking_node
      detects: booking_intent detection is re-run BUT...
```

The problem: `booking_node` runs keyword detection on the new message ("María González") which has no confirm keywords — so `booking_intent=False`. The booking is lost.

**Correct approach: carry `booking_pending_confirmation` through the graph as a continuation signal**

`booking_node` checks `state.get("booking_pending_confirmation", False)` first. If True AND `state.get("patient_name")` is now present (set upstream), it skips keyword detection and proceeds directly to create the calendar event using the already-captured `selected_slot_index` and `available_slots`.

**Complete multi-turn sequence:**

```
State after Turn 1:
  booking_intent: True
  booking_action: "confirm"
  selected_slot_index: 1
  booking_pending_confirmation: True
  patient_name: None
  patient_name_requested: False
  available_slots: [{slot1}, {slot2}, {slot3}]

Turn 2 entry: human "María González"

triage_node:
  (no change needed — can optionally set patient_name here via simple heuristic,
   but simpler to let booking_node handle it)

booking_node (MODIFIED):
  FIRST CHECK: if state.get("booking_pending_confirmation") and state.get("patient_name"):
      # Name just arrived — proceed to create event
      slot = available_slots[selected_slot_index]
      event_id = calendar_service.create_event(..., patient_name=patient_name)
      return {booking_intent: True, booking_action: "confirm",
              booked_slot: slot, calendar_event_id: event_id,
              booking_pending_confirmation: False}
  SECOND CHECK: (existing keyword detection on new message)

  In this turn: patient_name is still None → keyword detection runs
  "María González" has no confirm keywords → booking_intent=False
  → routing goes to scheduling → rag_retrieval → generation
  → generation_node sees booking_pending_confirmation=True, patient_name=None
  → LLM context: "We're waiting for patient name to confirm slot"
  → Latest human message is "María González" — no structured state field tells us it's a name yet

This fails because no node captures "María González" as the patient name.
```

**Resolution: dedicated name-capture in `generation_node`**

When `generation_node` receives a turn where `booking_pending_confirmation=True` and `patient_name` is absent:

1. Extract the latest human message content
2. Apply a simple guard: if message is non-empty and does not contain booking/cancel/scheduling keywords, treat it as the patient name
3. Write `patient_name` to the return dict (LangGraph will merge into state)
4. Also write `booking_intent=True`, `booking_action="confirm"` to state (re-assert)
5. Do NOT attempt calendar creation from generation_node — instead return a response like "Gracias María, voy a confirmar tu turno ahora"
6. On the NEXT turn (which the patient doesn't need to send), the graph needs to re-run booking

The problem with step 6: there is no next turn. The patient receives the "gracias" message and then sends another message, which starts a new graph invocation. At that point `booking_pending_confirmation=True` and `patient_name="María González"` are in the persisted state, so `booking_node` will pick up the continuation signal on ANY subsequent message.

**This is the correct 3-turn flow:**

```
Turn 1: "dale, el 2"
  → booking_node: no patient_name → sets booking_pending_confirmation=True, no event created
  → generation_node: asks for name
  → State saved to Supabase with: booking_pending_confirmation=True, selected_slot_index=1

Turn 2: "María González"
  → booking_node: booking_pending_confirmation=True BUT patient_name still absent
    → keyword detection: no confirm/cancel keywords → booking_intent=False
    → routing: scheduling → rag_retrieval → generation
  → generation_node: booking_pending_confirmation=True, patient_name absent
    → Captures "María González" as patient_name (no booking keywords present)
    → Returns: {patient_name: "María González",
                booking_pending_confirmation: True,
                patient_name_requested: True,
                messages: [AIMessage("Gracias María, confirmando tu turno...")]}
    → State saved: patient_name="María González", booking_pending_confirmation=True

Turn 3: (generation_node response triggers immediate re-invocation)
  ALTERNATIVE: generation_node performs booking directly after capturing name

```

**Recommended simplification: generation_node captures name AND triggers booking in one turn**

When `generation_node` detects `booking_pending_confirmation=True` and `patient_name` absent:
1. Check latest human message — no booking keywords → treat as name
2. Capture `patient_name` from message
3. Directly call `calendar_service.create_event()` with captured name and cached slot data from state
4. Return `{patient_name: captured_name, booking_pending_confirmation: False, booking_intent: True, booking_action: "confirm", booked_slot: slot, calendar_event_id: event_id, messages: [LLM-written confirmation]}`

This keeps everything in 2 turns and avoids a phantom Turn 3. The LLM writes the final confirmation message after booking succeeds. Calendar operation happens in `generation_node` only for this specific case — acceptable because:
- It is behind a specific guard condition (`booking_pending_confirmation=True`)
- The slot data is already validated (from `scheduling_node`)
- The alternative (3-turn flow) is worse UX

**State after Turn 2 (simplified 2-turn approach):**
```
patient_name: "María González"
booking_pending_confirmation: False
booking_intent: True
booked_slot: {slot data}
calendar_event_id: "abc123"
```

---

## Tool Binding Pattern

`search_knowledge_tool` is bound to the LLM in `generation_node` for the general/RAG code path only. The two deterministic bypasses (shadow mode, anti-diagnostic) never reach tool binding.

**Pattern (HIGH confidence — verified against LangGraph docs):**

```python
# In generation_node, for the LLM path:
from langgraph.prebuilt import ToolNode, tools_condition

search_tool = make_search_tool(state["tenant_id"])  # cached by tenant_id
llm_with_tools = _llm.bind_tools([search_tool])

# Build messages
messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])

# First LLM call — may produce tool_calls
ai_message = llm_with_tools.invoke(messages_for_llm)

# If LLM wants to call a tool, execute it inline (not via graph node)
if ai_message.tool_calls:
    tool_messages = []
    for tool_call in ai_message.tool_calls:
        if tool_call["name"] == "search_knowledge_tool":
            result = search_tool.invoke(tool_call["args"])
            tool_messages.append(
                ToolMessage(content=result, tool_call_id=tool_call["id"])
            )
    # Second LLM call with tool results
    final_response = llm_with_tools.invoke(
        messages_for_llm + [ai_message] + tool_messages
    )
    return {"messages": [ai_message] + tool_messages + [final_response]}
else:
    return {"messages": [ai_message]}
```

**Why inline tool execution instead of ToolNode graph node:**

The existing graph has no `tool_node` graph node and no `tools_condition` routing. Adding those would require graph topology changes (new node, new conditional edge). Inline tool execution in `generation_node` achieves the same result without touching `graph.py`. This is the surgical choice.

The tradeoff: inline execution means the tool loop is not observable via LangGraph's graph tracing at the node level — but `ToolMessage` entries in `state["messages"]` provide full observability.

**Multi-tenant isolation is preserved:** `make_search_tool(tenant_id)` is still the only place `tenant_id` is injected — the LLM only chooses the `query` argument, never the `tenant_id`. The `@functools.lru_cache` on `make_search_tool` means per-tenant tool instances are still cached.

**Tool call cap:** Limit to one tool call cycle in `generation_node`. If the LLM tries to chain multiple tool calls, only the first cycle is executed and a final response is generated. This prevents runaway loops.

---

## Build Order

**Phase 1: State schema extension (lowest risk, no behavior change)**

1. Add `patient_name`, `patient_name_requested`, `booking_pending_confirmation` to `ConversationState` as `NotRequired` fields
2. All existing tests pass unchanged because `NotRequired` fields are absent by default
3. No node logic changes in this phase

**Phase 2: `generation_node` restructure — booking and scheduling paths only**

Replace the hardcoded booking and scheduling string paths with LLM-driven responses using injected context blocks. The two deterministic bypasses (shadow, anti-diagnostic) are NOT touched.

Order within Phase 2:
1. Write `_build_generation_context()` helper
2. Replace `scheduling_intent` path: inject `<scheduling_context>`, call LLM (no tool binding yet)
3. Replace `booking_intent` paths (confirmed, cancelled, failed, ambiguous): inject `<booking_context>`, call LLM
4. Delete all `BOOKING_CONFIRMED_TEMPLATE`, `BOOKING_FAILED_NO_SLOTS`, `BOOKING_CANCELLED`, `BOOKING_NOT_FOUND`, `SCHEDULING_NO_SLOTS_RESPONSE` constants (or keep as fallback templates until tests pass)
5. Update unit tests to assert LLM is called for these paths (mock `_llm.invoke`)

**Phase 3: Tool binding for RAG path**

1. Modify `generation_node` LLM path to use `_llm.bind_tools([search_knowledge_tool])`
2. Add inline tool execution loop
3. Make `rag_retrieval_node` a no-op (return `{}`)
4. Update `generation_node` to not read `state["rag_context"]` (or treat it as legacy fallback)
5. Update integration tests for RAG path

**Phase 4: Patient name collection**

1. Modify `booking_node` to detect `booking_pending_confirmation` continuation and defer event creation when `patient_name` absent
2. Modify `generation_node` to handle `booking_pending_confirmation=True` + name capture + inline booking
3. End-to-end integration test for the 2-turn flow

**Phase 5: `booking_node` patient name passthrough**

1. Update `calendar_service.create_event()` signature to accept optional `patient_name`
2. Pass `patient_name` from state to `create_event()` in both `booking_node` and `generation_node` name-capture path
3. Update calendar event title/description to include patient name

---

## Risk Assessment

### Risk 1: LLM response quality for slot presentation — MEDIUM

**What could break:** The LLM may not present the 3 slots in a clean, numbered format. The hardcoded `1️⃣ 2️⃣ 3️⃣` format was predictable; LLM output is not.

**Mitigation:** The system prompt instruction must be explicit: "When presenting available_slots from the scheduling_context block, always number them 1, 2, 3 in the same order. Never reorder or skip slots." Validate in integration tests by checking that slot display strings appear in the response.

### Risk 2: LLM fails to call `search_knowledge_tool` — MEDIUM

**What could break:** For general queries, the LLM might answer from its own training data instead of calling the tool. This gives wrong clinic-specific answers.

**Mitigation:** Tool description in `search_knowledge_tool` already says "Use this tool whenever you need factual information about the clinic's services, prices, schedules, or policies." Add to system prompt: "You MUST use search_knowledge_tool to answer any question about this clinic's specific services, prices, or schedules. Do not answer from general knowledge."

### Risk 3: `booking_node` continuation logic breaks keyword detection — HIGH

**What could break:** The `booking_node` continuation check (`booking_pending_confirmation=True` + `patient_name` present) runs before keyword detection. If a patient's name accidentally contains a booking keyword (e.g., "Turno García"), `booking_node` might double-fire.

**Mitigation:** The continuation check must gate on `patient_name` being set in state by a prior turn, not by the current message. Since `patient_name` is written to state by `generation_node` in the previous turn, `booking_node` in Turn 3 (if using 3-turn flow) reads it from state, not from the current message. No keyword matching on the name itself.

### Risk 4: `rag_retrieval_node` becoming a no-op breaks the `rag_context` state field — LOW

**What could break:** Some tests or monitoring code may assert `rag_context` is populated. Making `rag_retrieval_node` return `{}` means `rag_context` stays as whatever it was last set to (or absent).

**Mitigation:** Add `return {"rag_context": ""}` from the no-op version of `rag_retrieval_node` to explicitly clear it. Update test assertions. Keep `rag_context` in `ConversationState` as a `NotRequired` legacy field — do not remove it until Phase 5 cleanup.

### Risk 5: Inline tool execution adds latency to every general query — LOW

**What could break:** Not a break, but a regression: general queries now take ~1-2s longer because of the tool call round-trip. In the current architecture, RAG was pre-fetched before `generation_node` was entered.

**Mitigation:** Acceptable for v1.2. The UX improvement (more natural responses) outweighs the latency regression. Monitor with `response_type="llm_with_tool"` log dimension.

### Risk 6: `generation_node` doing calendar operations violates separation of concerns — MEDIUM

**What could break:** If `calendar_service.create_event()` is called from `generation_node` (for the name-capture path), it makes `generation_node` no longer a pure response generator. Failures in calendar creation now affect the generation node's response path.

**Mitigation:** Wrap the inline calendar call in try/except within `generation_node`. On failure, have the LLM generate a "I couldn't complete the booking, try again" response. Log as `response_type="booking_from_generation"` to distinguish from `booking_node`-originated bookings. This is an acceptable localized violation for v1.2. Phase 5 can clean it up by introducing a proper continuation mechanism.

### Risk 7: Test coverage gap during Phase 2 — HIGH

**What could break:** Phase 2 replaces hardcoded strings with LLM calls. Existing unit tests that assert exact response strings will fail. Tests that mock `_llm.invoke` at `app.agent.nodes.generation._llm` will need updating.

**Mitigation:** Before Phase 2 starts, audit all existing `generation_node` tests. For each hardcoded-response test, update to: (a) assert `_llm.invoke` was called, (b) assert the context block was present in the system message argument, (c) assert response type logging (`response_type="llm"` instead of `"booking_confirmed"`). Do this before writing any production code changes in Phase 2.

---

## Integration Points Summary

| Integration point | What changes | What to verify |
|-------------------|-------------|----------------|
| `graph.py` | No changes | Graph topology tests still pass |
| `state.py` | 3 new `NotRequired` fields | All existing state tests still pass |
| `generation_node` — shadow bypass | No change | Exact hardcoded string still returned |
| `generation_node` — anti-diag bypass | No change | Exact hardcoded string still returned |
| `generation_node` — booking path | LLM replaces hardcoded string | `_llm.invoke` called, context block present |
| `generation_node` — scheduling path | LLM replaces hardcoded string | `_llm.invoke` called, slots in context |
| `generation_node` — RAG path | Tool binding replaces pre-fetch | `search_knowledge_tool` called by LLM |
| `rag_retrieval_node` | Returns `{}` | No longer populates `rag_context` |
| `booking_node` | Continuation check added | Defers event creation when name absent |
| `calendar_service.create_event()` | Optional `patient_name` param | Event title updated |
| `make_search_tool` | Unchanged | Multi-tenant isolation preserved |

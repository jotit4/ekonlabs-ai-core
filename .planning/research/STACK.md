# Stack Research — v1.2 Human-Feeling Agent

**Researched:** 2026-04-04
**Confidence:** HIGH (LangGraph APIs verified via official reference + community; model assessment verified via OpenAI docs + community reports)

---

## Summary

All v1.2 features (LLM tool calling, LLM-driven RAG, multi-turn name collection, LLM-generated responses) can be implemented with the **existing installed packages** — no new library installs are required. The work is purely architectural: replacing keyword-routing and hardcoded strings with `bind_tools` + `ToolNode` patterns inside the current LangGraph graph, and adding two fields to `ConversationState`. The only justified package change is an **optional model upgrade from `gpt-4o-mini` to `gpt-4.1-mini`** for improved tool-calling reliability and instruction-following, at comparable cost.

---

## Existing Stack (no changes needed)

- `langgraph>=0.0.15` — already installed; current stable is 1.1.0 (March 2026). The existing `langgraph` package ships `ToolNode`, `InjectedState`, and `tools_condition` inside `langgraph.prebuilt`. No separate install.
- `langchain-core>=0.1.0` — provides `@tool` decorator, `ToolMessage`, `AIMessage` with `tool_calls`. Already used in `search_tool.py` and `calendar_tool.py`.
- `langchain-openai>=0.0.5` — provides `ChatOpenAI.bind_tools()`. Already used in `generation.py`.
- `langchain-community>=0.0.20` — no new usage needed.
- `supabase`, `pgvector`, `redis`, `rq` — unchanged.
- All Google Calendar tooling — unchanged; remains deterministic (not LLM-called).

---

## New / Changed

| Package | Version | Why needed | Already installed? |
|---------|---------|------------|-------------------|
| `langgraph` (upgrade pin) | `>=1.0.0` | `ToolNode` in 1.x has a known breaking change: `handle_tool_errors` defaults to `False` in prebuilt 1.0.1+. Pinning to `>=1.0.0` makes the behavior explicit and avoids silent regressions. Current codebase pins `>=0.0.15` — too loose. | YES — needs re-pin only |
| `gpt-4.1-mini` (model swap, optional) | API model string | Introduced April 2025. 30% more efficient tool calls than gpt-4o; stronger instruction-following in long conversations; 1M token context. Same cost tier as gpt-4o-mini. Community reports show gpt-4o-mini has an increasing function-call failure rate. One-line change in `generation.py`. | YES — `langchain-openai` already supports it |

**No new pip packages required.**

---

## LangGraph Tool Calling Patterns

### 1. The core pattern: `bind_tools` + `ToolNode`

```python
# Import paths (LangGraph 1.x)
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.tools import tool

# Build an LLM with tools attached
tools = [search_knowledge_tool, some_other_tool]
llm_with_tools = ChatOpenAI(model="gpt-4.1-mini", temperature=0.3).bind_tools(tools)

# ToolNode executes whatever tool_calls the LLM emits
tool_node = ToolNode(tools, handle_tool_errors=True)  # explicit — default changed in 1.0.1
```

`ToolNode` receives the last `AIMessage`, iterates over its `.tool_calls` list, dispatches each call to the matching tool function, and returns a list of `ToolMessage` objects appended to `state["messages"]` via the `add_messages` reducer. If multiple tool calls are requested, they run in parallel.

### 2. `tools_condition` for routing

```python
from langgraph.prebuilt import tools_condition

builder.add_conditional_edges(
    "generation",
    tools_condition,   # returns "tools" if last AIMessage has tool_calls, else "__end__"
    {"tools": "tool_node", "__end__": END},
)
builder.add_edge("tool_node", "generation")  # loop back
```

`tools_condition` is a pre-built routing function. It returns `"tools"` when the last `AIMessage` contains at least one tool call, otherwise `"__end__"`. Use it to create the standard agent loop.

### 3. `InjectedState` — tenant isolation in tools (already partially used)

The existing `make_search_tool(tenant_id)` factory pattern works but creates closures. The LangGraph-native alternative uses `InjectedState` to pass state fields directly into tools, which ToolNode handles automatically:

```python
from typing import Annotated
from langgraph.prebuilt import InjectedState

@tool
def search_knowledge_tool(
    query: str,
    state: Annotated[dict, InjectedState],   # injected by ToolNode, never sent to LLM
) -> str:
    """Search the clinic's knowledge base."""
    tenant_id = state["tenant_id"]
    ...
```

`InjectedState` fields are stripped from the JSON schema shown to the LLM. The LLM only sees `query: str`. ToolNode injects `state` at execution time. This eliminates the `lru_cache` factory and makes tenant isolation more explicit.

For injecting a single field instead of the whole state:
```python
tenant_id: Annotated[str, InjectedState("tenant_id")]
```

### 4. Multi-turn state: patient name collection

The `ConversationState` needs one new field:

```python
patient_name: NotRequired[str | None]   # populated when name is collected
```

**Pattern: LLM-in-generation collects the name implicitly.** Since the generation node will now call the LLM for all paths (including booking confirmations), the system prompt instructs the LLM to ask for the name if it's missing before confirming. The LLM returns an `AIMessage` with no tool calls (it's asking a question), the graph ends that turn, and on the next message the LLM reads the patient's reply from `state["messages"]` and extracts the name.

There are two ways to persist the name:
- **Lightweight (recommended for v1.2):** The LLM reads the name from the conversation history in `messages`. No extra state field needed. The system prompt instructs: "Before confirming a booking, make sure you have the patient's name. If you don't have it from the conversation, ask for it first."
- **Explicit state field:** Extract the name in `booking_node` or via a dedicated tool call (`collect_patient_name_tool`) and store in `state["patient_name"]`. Pass to Calendar event creation. Required if Google Calendar events need the name embedded.

The explicit field is the right choice here because Calendar event creation needs the name. Add `patient_name: NotRequired[str | None]` to `ConversationState` and let the generation LLM call a `confirm_patient_name` tool or just extract it from messages in `booking_node`.

**No `interrupt()` / checkpointer needed.** The existing Supabase-based state persistence between RQ job invocations already handles multi-turn. The LLM simply reads prior messages from `state["messages"]` to find the name. LangGraph's `interrupt()` mechanism requires a checkpointer — the project deliberately avoids checkpointers (see `graph.py` comment). Stay with the existing pattern.

### 5. Replacing `rag_retrieval_node` with LLM-driven tool call

Current flow: `scheduling → rag_retrieval → generation` (pre-injection).
v1.2 flow: LLM calls `search_knowledge_tool` from inside generation when it needs clinic info.

```python
# In generation_node (v1.2):
llm_with_tools = _llm.bind_tools([make_search_tool(state["tenant_id"])])
response = llm_with_tools.invoke(messages_for_llm)

if response.tool_calls:
    # LLM decided to search — execute the tool and re-invoke
    tool_result = make_search_tool(state["tenant_id"]).invoke(response.tool_calls[0]["args"])
    # append ToolMessage + re-invoke LLM with the result
    ...
```

The cleaner LangGraph pattern is to add `tool_node` as a graph node and loop via `tools_condition`. But for a low-risk v1.2 implementation the generation node can handle a single-tool-call inline (simpler, avoids graph restructuring).

**Recommended approach for v1.2:** Keep the `rag_retrieval_node` in the graph as a fallback, but add `bind_tools` to the generation LLM so it can call `search_knowledge_tool` mid-response. Remove pre-injection of `rag_context`. The `rag_retrieval_node` becomes dead code and can be deleted in v1.3 after validation.

### 6. LLM-generated responses for all paths

Remove all hardcoded string constants (`BOOKING_CONFIRMED_TEMPLATE`, `SCHEDULING_NO_SLOTS_RESPONSE`, etc.) from `generation_node`. Pass structured data as context in the system message and let the LLM write the response:

```python
# Instead of:
return {"messages": [AIMessage(content=BOOKING_CONFIRMED_TEMPLATE.format(...))]}

# Do:
context_block = f"""
<booking_result>
  status: confirmed
  slot: {booked_slot.get('display')}
  patient_name: {state.get('patient_name', 'el paciente')}
</booking_result>
"""
# Inject into system prompt, call LLM normally
```

Anti-diagnostic and shadow-mode responses remain hardcoded (deterministic guardrails, by design).

---

## Model Assessment

### gpt-4o-mini: adequate but showing cracks

**Confidence: MEDIUM** (community forum reports + OpenAI status page incident, April 2025 context)

- Tool calling works and is used in production at scale.
- Community reports (OpenAI forum thread "failure rate of function calls of gpt-4o-mini is increasing") document a degrading function call failure rate, particularly in fine-tuned variants.
- OpenAI status page recorded an incident (Feb 2026) with elevated error rates on `gpt-4o-mini` fine-tuned models.
- The base (non-fine-tuned) `gpt-4o-mini` remains functional but: "occasionally drops formatting requirements or ignores secondary instructions under long conversations." For a WhatsApp agent with strict tone/voseo requirements and a detailed persona, this is a real risk.
- With 2-4 tools, selection accuracy is good. More tools increase wrong-tool-selection probability — keep the tool list small.

**For v1.2 this agent uses at most 1-2 tools (`search_knowledge_tool`, optionally a `confirm_booking_tool`), so gpt-4o-mini will work.** The risk is instruction-following degradation over long conversations, not tool selection errors.

### gpt-4.1-mini: recommended upgrade

**Confidence: HIGH** (OpenAI official announcement April 2025 + Azure announcement)

- Released April 2025. Same cost tier as gpt-4o-mini. 1M token context window.
- **30% more efficient tool calls** vs gpt-4o (the full model); by extension significantly better than gpt-4o-mini.
- **Stronger instruction-following** — follows prompts more literally. Critical for voseo, persona, and tone consistency.
- No API migration complexity — change one string: `"gpt-4o-mini"` → `"gpt-4.1-mini"` in `generation.py`.
- `langchain-openai` supports it with the existing package version.

**Recommendation: Use `gpt-4.1-mini`.** The instruction-following improvement directly addresses the persona fidelity goal of v1.2 (human-feeling agent, voseo, no templated copy). The tool-calling improvement reduces failure risk. The cost is equivalent. This is a low-risk, high-value swap.

**Do not use gpt-4o (full model).** Cost is 5-10x higher for a WhatsApp receptionist workload. gpt-4.1-mini is sufficient.

**Do not use o3/o4-mini.** Reasoning models add latency (seconds per token) that is unacceptable for WhatsApp where patients expect near-instant replies.

---

## What NOT to Add

| What | Why not |
|------|---------|
| `langchain-agents` / `AgentExecutor` | Deprecated pattern. LangGraph's `ToolNode` + `tools_condition` is the current standard. Adding AgentExecutor creates a parallel execution path that conflicts with the existing graph. |
| `create_react_agent` (prebuilt) | This creates a self-contained ReAct loop that replaces the graph. For v1.2 the goal is to add tool calling to the *existing* graph nodes, not replace the graph architecture. `create_react_agent` would discard all deterministic routing logic (anti-diagnostic, booking, shadow mode). |
| LangGraph `interrupt()` + checkpointer | Multi-turn name collection does NOT need LangGraph's interrupt mechanism. The project explicitly avoids checkpointers and uses Supabase for state persistence. Adding a checkpointer would require significant infrastructure changes for zero benefit here. |
| LangSmith tracing SDK | Useful for debugging, not required for v1.2 functionality. Add in a dedicated observability milestone. |
| `pydantic-ai` or other agent frameworks | Zero benefit over existing LangGraph setup. Would require rewrite. |
| More than 2 tools bound to generation LLM | Each additional tool increases wrong-selection probability. v1.2 needs: `search_knowledge_tool` (LLM-driven RAG). Maybe `collect_patient_name` as a structured extraction tool. Calendar operations stay deterministic in dedicated nodes. |
| Streaming (`astream`) | No streaming support in Evolution API / WhatsApp message delivery. All responses are full-message. Streaming adds async complexity with no UX benefit. |

---

## Sources

- LangGraph ToolNode reference: https://reference.langchain.com/python/langgraph.prebuilt/tool_node/ToolNode
- LangGraph InjectedState reference: https://reference.langchain.com/python/langgraph.prebuilt/tool_node/InjectedState
- LangGraph 1.0 breaking change (handle_tool_errors default): https://github.com/langchain-ai/langgraph/issues/6486
- LangGraph 1.0 langgraph-prebuilt breaking change: https://github.com/langchain-ai/langgraph/issues/6363
- LangGraph current version (1.1.0, March 2026): https://pypi.org/project/langgraph/
- InjectedState community guide: https://dragonforest.in/injectedstate-in-langgraph/
- gpt-4o-mini function call failure rate (community report): https://community.openai.com/t/the-failure-rate-of-function-calls-of-gpt-4o-mini-is-increasing/918874
- gpt-4.1 announcement (tool calling improvements): https://openai.com/index/gpt-4-1/
- gpt-4.1-mini overview: https://platform.openai.com/docs/models/gpt-4.1-mini
- gpt-4.1-mini vs gpt-4o-mini community comparison: https://community.openai.com/t/how-does-gpt-4-1-mini-compare-with-gpt-4o-mini-for-tool-calling/1285989
- LangGraph interrupt / human-in-the-loop: https://changelog.langchain.com/announcements/interrupt-simplifying-human-in-the-loop-agents

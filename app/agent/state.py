from typing import Annotated, Literal
from typing_extensions import TypedDict, NotRequired
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class ConversationState(TypedDict):
    tenant_id: str          # OBLIGATORIO en todo estado
    phone_number: str
    messages: Annotated[list[BaseMessage], add_messages]  # add_messages: reducer LangGraph 1.x (agrega, no sobreescribe)
    confidence_score: NotRequired[float]
    is_paused: NotRequired[bool]
    rag_context: NotRequired[str]   # Set by rag_retrieval_node; absent until that node runs
    system_prompt: NotRequired[str] # Populado por el worker desde get_tenant_config().system_prompt_override
    empathy_mode: NotRequired[Literal["normal", "urgent"]]  # Set by triage_node; absent = "normal" (default)
    is_medical_query: NotRequired[bool]  # Set by anti_diagnostic_node; absent = False (default)
    scheduling_intent: NotRequired[bool]   # Set by scheduling_node; absent = False (default)
    available_slots: NotRequired[list[dict]]  # Set by scheduling_node; list of {start, end, display}
    shadow_mode_active: NotRequired[bool]      # Set by scheduling_node/booking_node when shadow_mode_enabled=True
    booking_intent: NotRequired[bool]          # Set by booking_node; absent = False (default)
    booking_action: NotRequired[str]           # "confirm" | "cancel"; set by booking_node
    booked_slot: NotRequired[dict]             # The confirmed slot {start, end, display}
    calendar_event_id: NotRequired[str | None] # event_id returned by create_event / found by find_event_by_phone
    selected_slot_index: NotRequired[int]      # 0, 1 or 2 — which option the patient chose
    booking_ambiguous_slot: NotRequired[bool]  # Set by booking_node when slot selection is ambiguous; triggers clarification in generation_node
    # Phase 15 — Patient name collection
    patient_name: NotRequired[str | None]          # Patient's full name once captured; absent = not yet collected
    name_collection_active: NotRequired[bool]       # True while agent is waiting for patient to provide name
    slot_presented_at: NotRequired[str | None]      # ISO timestamp when slots were presented; used for 30-min TTL check
    name_attempts: NotRequired[int]                 # Times agent has asked for patient name; absent = 0

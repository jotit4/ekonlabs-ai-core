from typing import Annotated
from typing_extensions import TypedDict, NotRequired
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class ConversationState(TypedDict):
    tenant_id: str          # OBLIGATORIO en todo estado
    phone_number: str
    messages: Annotated[list[BaseMessage], add_messages]  # add_messages: reducer LangGraph 1.x (agrega, no sobreescribe)
    confidence_score: float
    is_paused: bool
    rag_context: NotRequired[str]   # Set by rag_retrieval_node; absent until that node runs
    system_prompt: NotRequired[str] # Populado por el worker desde get_tenant_config().system_prompt_override

from typing import List
from typing_extensions import TypedDict, NotRequired
from langchain_core.messages import BaseMessage


class ConversationState(TypedDict):
    tenant_id: str          # OBLIGATORIO en todo estado
    phone_number: str
    messages: List[BaseMessage]
    confidence_score: float
    is_paused: bool
    rag_context: NotRequired[str]   # Set by rag_retrieval_node; absent until that node runs
    system_prompt: NotRequired[str] # Populado por el worker desde get_tenant_config().system_prompt_override

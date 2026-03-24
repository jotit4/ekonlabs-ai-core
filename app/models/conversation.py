"""Data models: ConversationMessage y ConversationCreate."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

MessageRole = Literal["user", "assistant", "system"]


class ConversationMessage(BaseModel):
    id: UUID
    tenant_id: UUID
    phone_number: str
    role: MessageRole
    content: str
    created_at: datetime


class ConversationCreate(BaseModel):
    tenant_id: str          # str (UUID como texto) para Supabase insert
    phone_number: str
    role: MessageRole
    content: str

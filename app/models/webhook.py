"""Data models: WhatsApp webhook payload from Meta Graph API."""
from pydantic import BaseModel, ConfigDict, Field


class WhatsAppMetadata(BaseModel):
    display_phone_number: str
    phone_number_id: str


class WhatsAppTextContent(BaseModel):
    body: str


class WhatsAppMessage(BaseModel):
    from_: str = Field(alias="from")
    id: str
    timestamp: str
    type: str
    text: WhatsAppTextContent | None = None

    model_config = ConfigDict(populate_by_name=True)


class WhatsAppContact(BaseModel):
    profile: dict
    wa_id: str


class WhatsAppChangeValue(BaseModel):
    messaging_product: str
    metadata: WhatsAppMetadata
    contacts: list[WhatsAppContact] = []
    messages: list[WhatsAppMessage] = []


class WhatsAppChange(BaseModel):
    value: WhatsAppChangeValue
    field: str


class WhatsAppEntry(BaseModel):
    id: str
    changes: list[WhatsAppChange]


class WhatsAppWebhookPayload(BaseModel):
    object: str
    entry: list[WhatsAppEntry]

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


PHONE_PATTERN = r"^\+?[0-9]{8,20}$"


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    whatsapp_number: str = Field(pattern=PHONE_PATTERN)
    timezone: str = Field(min_length=1, max_length=64)
    shadow_mode_enabled: bool = False
    status: Literal["active", "inactive"] = "active"

    model_config = ConfigDict(str_strip_whitespace=True)


class TenantRulesUpdate(BaseModel):
    """Payload para PATCH /api/v1/tenants/{tenant_id}/rules (Story 1.4).

    Ambos campos son opcionales (None = no modificar).
    Si `rules` se provee, se hace shallow merge con las rules existentes del Tenant.
    """

    system_prompt_override: str | None = None
    rules: dict | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TenantConfig(BaseModel):
    tenant_id: UUID
    name: str
    whatsapp_number: str
    timezone: str
    shadow_mode_enabled: bool
    status: Literal["active", "inactive"]
    system_prompt_override: str | None = None
    rules: dict = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)


class TenantResponse(TenantConfig):
    created_at: datetime | None = None
    updated_at: datetime | None = None

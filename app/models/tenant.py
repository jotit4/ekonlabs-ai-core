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
    # Epic 3 — Google Calendar (nullable; tenants sin calendario operan con RAG normal)
    calendar_id: str | None = None
    calendar_credentials: dict | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TenantResponse(TenantConfig):
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Service(BaseModel):
    """Servicio / profesional de un tenant con su propio Google Calendar."""
    service_id: str
    tenant_id: str
    name: str                           # ej: "Kinesiología", "Pilates"
    calendar_id: str
    professional_name: str | None = None  # ej: "María García"
    duration_minutes: int = 60
    active: bool = True
    # Booking rules (migration 006)
    booking_mode: str = "appointment"           # "appointment" | "walk_in" | "gated"
    prerequisite_note: str | None = None        # Texto para mostrar al paciente en modo gated
    capacity_per_slot: int | None = None        # None = sin límite; ej: 6 para kinesiología grupal
    requires_prescription: bool = False         # Requiere pedido médico obligatorio
    is_referral_only: bool = False              # Solo accesible por derivación médica
    reminder_hours_before: int | None = None    # None = sin recordatorio automático
    reminder_instructions: str | None = None    # Instrucción específica del servicio (ej: "comer liviano")

    model_config = ConfigDict(str_strip_whitespace=True)

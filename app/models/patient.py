"""Modelos Pydantic para pacientes y turnos (v1.4 — Patient Registration)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class Patient(BaseModel):
    patient_id: str
    tenant_id: str
    phone_number: str
    full_name: str
    dni: str | None = None
    date_of_birth: date | None = None
    email: str | None = None
    obra_social: str | None = None
    obra_social_number: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(str_strip_whitespace=True)


class Appointment(BaseModel):
    appointment_id: str
    tenant_id: str
    patient_id: str
    service_id: str | None = None
    calendar_event_id: str | None = None
    start_at: datetime
    end_at: datetime
    status: str = "confirmed"
    booked_via: str = "whatsapp"
    cancelled_at: datetime | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(str_strip_whitespace=True)

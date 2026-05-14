"""Booking draft — persiste el estado de reserva en progreso en Redis.

El grafo LangGraph no tiene checkpointer: el estado se resetea en cada turno.
Los mensajes se persisten en Supabase, pero campos como booked_slot, patient_name,
name_collection_active, etc. son efímeros. Este servicio los guarda en Redis con
TTL de 24 horas para que booking_node y generation_node puedan re-hidratar el
estado en turnos subsiguientes durante el día.

Nota: el check de slot_presented_at (NAME-07) sigue expirando a los 30 minutos
de forma independiente al TTL del draft. El draft puede vivir 24h mientras que
una oferta de slot específica expira a los 30 min.
"""
from __future__ import annotations

import json

from redis import Redis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_DRAFT_TTL = 86_400  # 24 horas — el contexto del paciente persiste el día entero


def _key(tenant_id: str, phone_number: str) -> str:
    return f"booking_draft:{tenant_id}:{phone_number}"


def save_draft(tenant_id: str, phone_number: str, draft: dict) -> None:
    """Guarda o sobreescribe el booking draft en Redis con TTL de 24 horas."""
    try:
        r = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.setex(_key(tenant_id, phone_number), _DRAFT_TTL, json.dumps(draft))
    except Exception as exc:
        logger.error("booking_draft.save_error", tenant_id=tenant_id, error=str(exc))


def get_draft(tenant_id: str, phone_number: str) -> dict | None:
    """Lee el booking draft de Redis. Retorna None si no existe o falló."""
    try:
        r = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        raw = r.get(_key(tenant_id, phone_number))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.error("booking_draft.get_error", tenant_id=tenant_id, error=str(exc))
        return None


def update_draft(tenant_id: str, phone_number: str, updates: dict) -> None:
    """Actualiza campos del draft existente (merge superficial). Renueva el TTL."""
    try:
        r = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        key = _key(tenant_id, phone_number)
        raw = r.get(key)
        if raw:
            draft = json.loads(raw)
            draft.update(updates)
            r.setex(key, _DRAFT_TTL, json.dumps(draft))
    except Exception as exc:
        logger.error("booking_draft.update_error", tenant_id=tenant_id, error=str(exc))


def delete_draft(tenant_id: str, phone_number: str) -> None:
    """Elimina el draft (booking completado o cancelado)."""
    try:
        r = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.delete(_key(tenant_id, phone_number))
    except Exception as exc:
        logger.error("booking_draft.delete_error", tenant_id=tenant_id, error=str(exc))

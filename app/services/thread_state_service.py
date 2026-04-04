"""Servicio de estado de hilo conversacional — lectura y escritura en tabla `thread_states`.

Gestiona el estado de pausa (PAUSED / ACTIVE) por binomio (tenant_id, phone_number).
Story 3.4: paused por low_confidence en generation_node.
Story 4.1: paused por human_takeover vía webhook saliente.
Story 4.2: reactivado a ACTIVE mediante slash command /resume.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.database import get_supabase_client
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_thread_status(tenant_id: str, phone_number: str) -> str:
    """Retorna el estado del hilo conversacional para el binomio dado.

    Si no existe registro en `thread_states`, el hilo se considera 'active'
    (comportamiento por defecto — no se crean registros para hilos activos nuevos).

    Args:
        tenant_id: UUID del tenant como string.
        phone_number: Número de teléfono del paciente.

    Returns:
        'active' o 'paused'. Retorna 'active' ante cualquier error de DB
        para evitar silenciar hilos por fallas de infraestructura.
    """
    client = get_supabase_client()
    try:
        result = (
            client.table("thread_states")
            .select("status")
            .eq("tenant_id", tenant_id)
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "thread_state_service.get_status.error — asumiendo active",
            tenant_id=tenant_id,
            phone=phone_number,
            error=str(exc),
        )
        return "active"

    data = getattr(result, "data", None) or []
    if not data:
        return "active"

    status = data[0].get("status", "active")
    logger.info(
        "thread_state_service.get_status",
        tenant_id=tenant_id,
        phone=phone_number,
        status=status,
    )
    return status


def set_thread_paused(
    tenant_id: str,
    phone_number: str,
    reason: str = "low_confidence",
) -> None:
    """Persiste el estado PAUSED para el hilo dado mediante UPSERT.

    Crea el registro si no existe; lo actualiza si ya existe.
    Operación idempotente — llamadas repetidas no generan efectos secundarios.

    Args:
        tenant_id: UUID del tenant como string.
        phone_number: Número de teléfono del paciente.
        reason: Razón de la pausa ('low_confidence' o 'human_takeover').
    """
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        client.table("thread_states").upsert(
            {
                "tenant_id": tenant_id,
                "phone_number": phone_number,
                "status": "paused",
                "paused_reason": reason,
                "paused_at": now_iso,
                "updated_at": now_iso,
            },
            on_conflict="tenant_id,phone_number",
        ).execute()
    except Exception as exc:
        logger.error(
            "thread_state_service.set_paused.error",
            tenant_id=tenant_id,
            phone=phone_number,
            reason=reason,
            error=str(exc),
        )
        raise

    logger.info(
        "thread_state_service.set_paused",
        tenant_id=tenant_id,
        phone=phone_number,
        reason=reason,
    )


def set_thread_active(tenant_id: str, phone_number: str) -> None:
    """Revierte el estado del hilo a ACTIVE (idempotente).

    Usado por Story 4.2 cuando la recepcionista envía el slash command /resume.
    Limpia paused_reason y paused_at. Si el hilo ya está activo, la operación
    no genera efectos secundarios (UPSERT idempotente).

    Args:
        tenant_id: UUID del tenant como string.
        phone_number: Número de teléfono del paciente.
    """
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        client.table("thread_states").upsert(
            {
                "tenant_id": tenant_id,
                "phone_number": phone_number,
                "status": "active",
                "paused_reason": None,
                "paused_at": None,
                "updated_at": now_iso,
            },
            on_conflict="tenant_id,phone_number",
        ).execute()
    except Exception as exc:
        logger.error(
            "thread_state_service.set_active.error",
            tenant_id=tenant_id,
            phone=phone_number,
            error=str(exc),
        )
        raise

    logger.info(
        "thread_state_service.set_active",
        tenant_id=tenant_id,
        phone=phone_number,
    )

"""Servicio: CRUD para pacientes y turnos (v1.4 — Patient Registration)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.database import get_supabase_client
from app.core.logging import get_logger
from app.models.patient import Appointment, Patient

logger = get_logger(__name__)


def get_patient_by_phone(tenant_id: str, phone_number: str) -> Patient | None:
    """Busca un paciente por (tenant_id, phone_number). Retorna None si no existe."""
    try:
        client = get_supabase_client()
        response = (
            client.table("patients")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
        if response.data:
            return Patient(**response.data[0])
        return None
    except Exception as exc:
        logger.error(
            "patient_service.get_patient_by_phone.error",
            tenant_id=tenant_id,
            phone_number=phone_number,
            error=str(exc),
        )
        return None


def get_patient_by_dni(tenant_id: str, dni: str) -> dict | None:
    """Busca un paciente por tenant + DNI. Retorna el dict del registro o None."""
    client = get_supabase_client()
    result = (
        client.table("patients")
        .select("patient_id, full_name, dni, phone_number, obra_social, obra_social_number")
        .eq("tenant_id", tenant_id)
        .eq("dni", dni)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_or_create_patient(
    tenant_id: str,
    phone_number: str,
    full_name: str,
    dni: str | None = None,
    obra_social: str | None = None,
    obra_social_number: str | None = None,
    reason_for_visit: str | None = None,
    alternative_phone: str | None = None,
    address: str | None = None,
) -> Patient:
    """Upsert del paciente.

    Si ya existe (tenant_id, phone_number): actualiza full_name y dni (solo si se provee
    un valor que no estaba). Retorna el registro final.

    Raises:
        Exception: si el upsert falla (propagado al caller para fail-fast en booking).
    """
    client = get_supabase_client()

    # Construir payload — dni solo si se proveyó (no pisamos un dni existente con None)
    upsert_data: dict = {
        "tenant_id": tenant_id,
        "phone_number": phone_number,
        "full_name": full_name,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if dni is not None:
        upsert_data["dni"] = dni
    if obra_social is not None:
        upsert_data["obra_social"] = obra_social
    if obra_social_number is not None:
        upsert_data["obra_social_number"] = obra_social_number
    if reason_for_visit is not None:
        upsert_data["reason_for_visit"] = reason_for_visit
    if alternative_phone is not None:
        upsert_data["alternative_phone"] = alternative_phone
    if address is not None:
        upsert_data["address"] = address

    response = (
        client.table("patients")
        .upsert(upsert_data, on_conflict="tenant_id,phone_number")
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            f"patient_service.get_or_create_patient: upsert returned no data "
            f"for tenant={tenant_id} phone={phone_number}"
        )

    patient = Patient(**response.data[0])
    logger.info(
        "patient_service.get_or_create_patient.done",
        tenant_id=tenant_id,
        patient_id=patient.patient_id,
        has_dni=bool(patient.dni),
    )
    return patient


def create_appointment(
    tenant_id: str,
    patient_id: str,
    service_id: str | None,
    calendar_event_id: str | None,
    start_iso: str,
    end_iso: str,
    professional_id: str | None = None,
) -> Appointment:
    """Persiste un turno en la tabla appointments.

    Google Calendar sigue siendo la fuente de verdad; esta tabla es un mirror
    para historial y queries de la clínica.

    Raises:
        Exception: si el insert falla.
    """
    client = get_supabase_client()

    insert_data: dict = {
        "tenant_id": tenant_id,
        "patient_id": patient_id,
        "service_id": service_id,
        "calendar_event_id": calendar_event_id,
        "start_at": start_iso,
        "end_at": end_iso,
        "status": "confirmed",
        "booked_via": "whatsapp",
    }
    if professional_id is not None:
        insert_data["professional_id"] = professional_id

    response = client.table("appointments").insert(insert_data).execute()

    if not response.data:
        raise RuntimeError(
            f"patient_service.create_appointment: insert returned no data "
            f"for patient={patient_id}"
        )

    appt = Appointment(**response.data[0])
    logger.info(
        "patient_service.create_appointment.done",
        tenant_id=tenant_id,
        appointment_id=appt.appointment_id,
        patient_id=patient_id,
        calendar_event_id=calendar_event_id,
    )
    return appt


def find_upcoming_appointment(tenant_id: str, phone_number: str) -> dict | None:
    """Busca el próximo appointment confirmado de un paciente por número de teléfono.

    Retorna el dict del appointment (con appointment_id) o None si no hay ninguno.
    Fail-safe: errores se loggean pero no se propagan.
    """
    try:
        patient = get_patient_by_phone(tenant_id, phone_number)
        if patient is None:
            return None
        client = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        result = (
            client.table("appointments")
            .select("*")
            .eq("patient_id", patient.patient_id)
            .eq("status", "confirmed")
            .gte("start_at", now_iso)
            .order("start_at", desc=False)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error(
            "patient_service.find_upcoming_appointment.error",
            tenant_id=tenant_id,
            phone_number=phone_number,
            error=str(exc),
        )
        return None


def cancel_appointment_by_id(
    appointment_id: str,
    cancelled_by: str = "patient",
    cancellation_reason: str | None = None,
) -> bool:
    """Marca el appointment como cancelado por appointment_id.

    Retorna True si se actualizó algún registro, False si no encontró nada.
    Fail-safe: errores se loggean pero no se propagan.
    """
    try:
        client = get_supabase_client()
        update_data: dict = {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": cancelled_by,
        }
        if cancellation_reason is not None:
            update_data["cancellation_reason"] = cancellation_reason
        response = (
            client.table("appointments")
            .update(update_data)
            .eq("appointment_id", appointment_id)
            .execute()
        )
        updated = bool(response.data)
        logger.info(
            "patient_service.cancel_appointment_by_id.done",
            appointment_id=appointment_id,
            updated=updated,
        )
        return updated
    except Exception as exc:
        logger.error(
            "patient_service.cancel_appointment_by_id.error",
            appointment_id=appointment_id,
            error=str(exc),
        )
        return False


def cancel_appointment_by_event_id(
    calendar_event_id: str,
    cancelled_by: str = "patient",
    cancellation_reason: str | None = None,
) -> bool:
    """Marca el appointment como cancelado por calendar_event_id.

    Retorna True si se actualizó algún registro, False si no encontró nada.
    Fail-safe: errores se loggean pero no se propagan (cancelación en Calendar ya ocurrió).
    """
    try:
        client = get_supabase_client()
        update_data: dict = {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": cancelled_by,
        }
        if cancellation_reason is not None:
            update_data["cancellation_reason"] = cancellation_reason
        response = (
            client.table("appointments")
            .update(update_data)
            .eq("calendar_event_id", calendar_event_id)
            .execute()
        )
        updated = bool(response.data)
        logger.info(
            "patient_service.cancel_appointment.done",
            calendar_event_id=calendar_event_id,
            updated=updated,
        )
        return updated
    except Exception as exc:
        logger.error(
            "patient_service.cancel_appointment.error",
            calendar_event_id=calendar_event_id,
            error=str(exc),
        )
        return False

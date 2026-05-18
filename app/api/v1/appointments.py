"""Router de appointments — expone /api/v1/appointments/soft-sync.

soft-sync: sincroniza los turnos de un paciente desde Google Calendar (o Supabase
native calendar) hacia la tabla `appointments`, para que el dashboard pueda
mostrar el historial sin consultar directamente Calendar.

POST /api/v1/appointments/soft-sync
  Headers: X-API-Key: <ADMIN_API_KEY>
  Body:    { "tenant_id": "...", "patient_id": "..." }
  Returns: { "status": "completed", "affected_dates": ["YYYY-MM-DD", ...] }
         | { "status": "not_found" }   (paciente o tenant inexistente)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_supabase_client
from app.core.logging import get_logger
from app.services import calendar_service, tenant_service
from app.services.vault_client import resolve_calendar_credentials

logger = get_logger(__name__)

router = APIRouter(tags=["appointments"])


# -- Auth dependency ----------------------------------------------------------

def _require_admin_api_key(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    if x_api_key is None or x_api_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# -- Request model ------------------------------------------------------------

class SoftSyncRequest(BaseModel):
    tenant_id: str
    patient_id: str


# -- Endpoint -----------------------------------------------------------------

@router.post("/appointments/soft-sync")
async def soft_sync_appointments(
    payload: SoftSyncRequest,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Sincroniza los turnos del paciente desde Calendar hacia la tabla appointments.

    Para tenants con uses_native_calendar=True los datos ya estan en Supabase;
    simplemente se retornan las fechas de los appointments confirmados futuros
    para que el dashboard invalide sus queries de agenda.

    Para tenants con Google Calendar: busca el proximo evento del paciente
    en Calendar y hace upsert en appointments si aun no existe.

    Siempre retorna 200 con status='completed' o status='not_found'.
    """
    tenant_id = payload.tenant_id
    patient_id = payload.patient_id

    try:
        client = get_supabase_client()

        # 1. Obtener datos del paciente
        patient_res = (
            client.table("patients")
            .select("patient_id,phone_number,full_name")
            .eq("tenant_id", tenant_id)
            .eq("patient_id", patient_id)
            .limit(1)
            .execute()
        )
        if not patient_res.data:
            logger.info(
                "appointments.soft_sync.patient_not_found",
                tenant_id=tenant_id,
                patient_id=patient_id,
            )
            return JSONResponse(
                status_code=200,
                content={"status": "not_found", "affected_dates": []},
            )

        patient = patient_res.data[0]
        phone_number: str = patient["phone_number"]

        # 2. Obtener configuracion del tenant para saber que calendario usa
        tenant_config = await asyncio.to_thread(
            tenant_service.get_tenant_config, tenant_id
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        affected_dates: list[str] = []

        if tenant_config.uses_native_calendar:
            # Native calendar: los appointments ya estan en Supabase.
            # Retornar fechas de turnos futuros confirmados para invalidar queries de agenda.
            appts_res = (
                client.table("appointments")
                .select("start_at")
                .eq("tenant_id", tenant_id)
                .eq("patient_id", patient_id)
                .eq("status", "confirmed")
                .gte("start_at", now_iso)
                .execute()
            )
            for appt in (appts_res.data or []):
                try:
                    dt = datetime.fromisoformat(appt["start_at"])
                    date_str = dt.date().isoformat()
                    if date_str not in affected_dates:
                        affected_dates.append(date_str)
                except (ValueError, KeyError):
                    pass

        else:
            # Google Calendar: buscar evento y hacer upsert en appointments.
            try:
                credentials_dict = resolve_calendar_credentials(
                    tenant_config.calendar_credentials_ref,
                    tenant_config.calendar_credentials,
                )
            except ValueError:
                credentials_dict = {}

            # Determinar calendar_id(s): usar servicios activos o el del tenant
            services = await asyncio.to_thread(
                tenant_service.get_tenant_services, tenant_id
            )
            calendar_ids: list[str] = []
            if services:
                calendar_ids = [s.calendar_id for s in services if s.calendar_id and s.active]
            if not calendar_ids and tenant_config.calendar_id:
                calendar_ids = [tenant_config.calendar_id]

            for cal_id in calendar_ids:
                if not cal_id or not credentials_dict:
                    continue

                # Buscar evento del paciente en Calendar (7 dias de lookahead)
                event_id = await asyncio.to_thread(
                    calendar_service.find_event_by_phone,
                    cal_id,
                    credentials_dict,
                    phone_number,
                    168,
                )
                if not event_id:
                    continue

                # Obtener start/end del evento desde Calendar
                try:
                    from google.oauth2 import service_account
                    from googleapiclient.discovery import build

                    creds = service_account.Credentials.from_service_account_info(
                        credentials_dict,
                        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
                    )
                    gcal = build("calendar", "v3", credentials=creds)
                    event = await asyncio.to_thread(
                        lambda: gcal.events().get(calendarId=cal_id, eventId=event_id).execute()
                    )
                    start_str = (
                        event.get("start", {}).get("dateTime")
                        or event.get("start", {}).get("date")
                    )
                    end_str = (
                        event.get("end", {}).get("dateTime")
                        or event.get("end", {}).get("date")
                    )
                    if not start_str or not end_str:
                        continue
                except Exception as exc:
                    logger.warning(
                        "appointments.soft_sync.event_fetch_error",
                        tenant_id=tenant_id,
                        event_id=event_id,
                        error=str(exc),
                    )
                    continue

                # Check si ya existe el appointment en la tabla
                existing_res = (
                    client.table("appointments")
                    .select("appointment_id,start_at")
                    .eq("tenant_id", tenant_id)
                    .eq("patient_id", patient_id)
                    .eq("calendar_event_id", event_id)
                    .limit(1)
                    .execute()
                )

                if existing_res.data:
                    appt_row = existing_res.data[0]
                else:
                    # Insertar nuevo appointment
                    insert_data = {
                        "tenant_id": tenant_id,
                        "patient_id": patient_id,
                        "calendar_event_id": event_id,
                        "start_at": start_str,
                        "end_at": end_str,
                        "status": "confirmed",
                        "booked_via": "whatsapp",
                    }
                    inserted = client.table("appointments").insert(insert_data).execute()
                    appt_row = inserted.data[0] if inserted.data else {"start_at": start_str}

                # Registrar fecha afectada
                try:
                    start_val = appt_row.get("start_at", start_str)
                    dt = datetime.fromisoformat(start_val.replace("Z", "+00:00"))
                    date_str = dt.date().isoformat()
                    if date_str not in affected_dates:
                        affected_dates.append(date_str)
                except (ValueError, KeyError):
                    pass

        logger.info(
            "appointments.soft_sync.done",
            tenant_id=tenant_id,
            patient_id=patient_id,
            affected_dates=affected_dates,
        )
        return JSONResponse(
            status_code=200,
            content={"status": "completed", "affected_dates": affected_dates},
        )

    except Exception as exc:
        logger.error(
            "appointments.soft_sync.error",
            tenant_id=tenant_id,
            patient_id=patient_id,
            error=str(exc),
        )
        # Fail-safe: no bloquear el dashboard, retornar completed sin fechas
        return JSONResponse(
            status_code=200,
            content={"status": "completed", "affected_dates": []},
        )

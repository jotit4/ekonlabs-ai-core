"""Google Calendar API v3 — Disponibilidad (Story 3.1) e Inserción/Cancelación (Story 3.2)."""
from __future__ import annotations

import hashlib
import time as _time

_CREATE_EVENT_RETRY_DELAY_S = 1.0
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.core.logging import get_logger

logger = get_logger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
SCOPES_WRITE = ["https://www.googleapis.com/auth/calendar"]

# Horario laboral expresado en la timezone efectiva del calendario.
_WORK_START_HOUR = 9
_WORK_END_HOUR = 18    # Los slots terminan a más tardar a las 18:00 locales

_MONTHS_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}
_DAYS_ES = {
    0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
    4: "Viernes", 5: "Sábado", 6: "Domingo",
}


def _lookup_token(phone_number: str, calendar_id: str) -> str:
    """Opaque, deterministic token for calendar event lookup.

    Derived from (phone, calendar_id) so it is consistent across create/find
    calls without storing raw PII in the event description.
    The first 20 hex chars (80 bits) are more than sufficient to prevent
    collision across a single tenant's calendar.
    """
    raw = f"{phone_number}:{calendar_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


def _resolve_timezone(timezone_name: str | None):
    """Resuelve la timezone del calendario; fallback defensivo a UTC."""
    if not timezone_name:
        return timezone.utc
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning(
            "calendar_service.unknown_timezone",
            calendar_timezone=timezone_name,
        )
        return timezone.utc


def _parse_event_dt(dt_str: str, default_timezone) -> datetime | None:
    """Parsea un string ISO de evento a datetime aware en la timezone del calendario."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=default_timezone)
        return dt.astimezone(default_timezone)
    except (ValueError, AttributeError):
        return None


def _format_display(slot_start: datetime, slot_end: datetime) -> str:
    """Genera etiqueta legible en español: 'Jueves 26 de Marzo — 10:00 a 11:00 hs'."""
    day_name = _DAYS_ES[slot_start.weekday()]
    month_name = _MONTHS_ES[slot_start.month]
    return (
        f"{day_name} {slot_start.day} de {month_name} "
        f"— {slot_start.strftime('%H:%M')} a {slot_end.strftime('%H:%M')} hs"
    )


def get_available_slots(
    calendar_id: str,
    credentials_dict: dict,
    duration_minutes: int = 60,
    lookahead_hours: int = 72,
    start_date: datetime | None = None,
) -> list[dict]:
    """Consulta Google Calendar y retorna hasta 3 franjas horarias libres.

    Algoritmo:
        1. Obtener eventos existentes desde ahora hasta time_max.
        2. Iterar por días laborales (Lun-Vie) generando candidatos en horario
           laboral (09:00-18:00 UTC), paso de 1 hora.
        3. Filtrar candidatos que colisionan con eventos existentes.
        4. Retornar los primeros 3 slots libres.

    Args:
        calendar_id: ID del calendario del tenant (campo `calendar_id` en tabla tenants).
        credentials_dict: Service account JSON ya deserializado (campo `calendar_credentials`).
        duration_minutes: Duración de cada slot en minutos (default 60).
        lookahead_hours: Ventana de búsqueda en horas (default 72).
        start_date: Si se provee, buscar slots no antes de esta fecha. Útil cuando el
            paciente pidió un día específico o quiere ver "otro día".

    Returns:
        Lista de hasta 3 dicts con claves `start`, `end`, `display`.
        Retorna `[]` en caso de error (fail-safe).
    """
    t0 = _time.monotonic()

    try:
        credentials = service_account.Credentials.from_service_account_info(
            credentials_dict,
            scopes=SCOPES,
        )
        service = build("calendar", "v3", credentials=credentials)

        now = datetime.now(timezone.utc)
        time_min = now
        # Si hay start_date, extender time_max para cubrir desde esa fecha
        effective_start = max(now, start_date) if start_date else now
        time_max = effective_start + timedelta(hours=lookahead_hours)

        events_result = (
            service.events()
            .list(
                calendarId=calendar_id,
                timeMin=time_min.isoformat(),
                timeMax=time_max.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
        events = events_result.get("items", [])
        calendar_timezone = _resolve_timezone(events_result.get("timeZone"))
        time_min_local = time_min.astimezone(calendar_timezone)
        time_max_local = time_max.astimezone(calendar_timezone)
        effective_start_local = effective_start.astimezone(calendar_timezone)

        # Construir lista de intervalos ocupados
        busy: list[tuple[datetime, datetime]] = []
        for event in events:
            start_str = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
            end_str = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date")
            start_dt = _parse_event_dt(start_str, calendar_timezone)
            end_dt = _parse_event_dt(end_str, calendar_timezone)
            if start_dt and end_dt:
                busy.append((start_dt, end_dt))

        # Generar candidatos en días laborales — comenzar desde effective_start
        free_slots: list[datetime] = []
        slot_duration = timedelta(minutes=duration_minutes)
        current_day = effective_start_local.replace(hour=0, minute=0, second=0, microsecond=0)

        while current_day < time_max_local and len(free_slots) < 3:
            if current_day.weekday() < 5:  # Lun=0 … Vie=4
                work_start = current_day.replace(hour=_WORK_START_HOUR, minute=0, second=0, microsecond=0)
                work_end = current_day.replace(hour=_WORK_END_HOUR, minute=0, second=0, microsecond=0)

                # El primer slot del día no puede ser anterior a effective_start
                candidate = work_start if work_start >= effective_start_local else _next_full_hour(effective_start_local)

                while candidate + slot_duration <= work_end:
                    if candidate >= time_max_local:
                        break

                    # Verificar colisión con eventos ocupados
                    candidate_end = candidate + slot_duration
                    is_free = all(
                        candidate >= busy_end or candidate_end <= busy_start
                        for busy_start, busy_end in busy
                    )

                    if is_free:
                        free_slots.append(candidate)
                        if len(free_slots) >= 3:
                            break

                    candidate += timedelta(hours=1)

            current_day += timedelta(days=1)

        # Formatear resultado
        result = []
        for slot_start in free_slots:
            slot_end = slot_start + slot_duration
            result.append({
                "start": slot_start.isoformat(),
                "end": slot_end.isoformat(),
                "display": _format_display(slot_start, slot_end),
            })

        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.info(
            "calendar_service.get_available_slots.done",
            calendar_id=calendar_id,
            slots_found=len(result),
            duration_ms=duration_ms,
        )
        return result

    except Exception as exc:
        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.error(
            "calendar_service.get_available_slots.error",
            calendar_id=calendar_id,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return []


def _next_full_hour(dt: datetime) -> datetime:
    """Redondea `dt` hacia arriba a la próxima hora en punto."""
    if dt.minute == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    return (dt + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)


def create_event(
    calendar_id: str,
    credentials_dict: dict,
    start_iso: str,
    end_iso: str,
    phone_number: str,
    title: str | None = None,
) -> str | None:
    """Inserta un evento en Google Calendar y retorna el event_id.

    Args:
        calendar_id: ID del calendario del tenant.
        credentials_dict: Service account JSON ya deserializado.
        start_iso: Datetime de inicio en formato ISO 8601 con timezone.
        end_iso: Datetime de fin en formato ISO 8601 con timezone.
        phone_number: Número del paciente — se usa para generar el token de
            lookup; el número crudo NO se escribe en el evento.
        title: Título del evento (default: "Turno").

    Returns:
        El event_id del evento creado, o None si falla (fail-safe).
    """
    t0 = _time.monotonic()
    try:
        credentials = service_account.Credentials.from_service_account_info(
            credentials_dict,
            scopes=SCOPES_WRITE,
        )
        service = build("calendar", "v3", credentials=credentials)

        event_title = title or "Turno"
        token = _lookup_token(phone_number, calendar_id)
        description = (
            f"Turno reservado vía Agente IA\n"
            f"ref:{token}\n"
            f"Confirmado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )
        event_body = {
            "summary": event_title,
            "description": description,
            "start": {"dateTime": start_iso},
            "end": {"dateTime": end_iso},
        }

        last_exc: Exception | None = None
        for attempt in range(2):
            if attempt > 0:
                _time.sleep(_CREATE_EVENT_RETRY_DELAY_S)
            try:
                result = (
                    service.events().insert(calendarId=calendar_id, body=event_body).execute()
                )
                event_id = result.get("id")
                duration_ms = int((_time.monotonic() - t0) * 1000)
                logger.info(
                    "calendar_service.create_event.done",
                    calendar_id=calendar_id,
                    event_id=event_id,
                    duration_ms=duration_ms,
                    attempt=attempt,
                )
                return event_id
            except Exception as exc:
                logger.warning(
                    "calendar_service.create_event.retry",
                    calendar_id=calendar_id,
                    attempt=attempt,
                    error=str(exc),
                )
                last_exc = exc

        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.error(
            "calendar_service.create_event.error",
            calendar_id=calendar_id,
            error=str(last_exc),
            duration_ms=duration_ms,
        )
        return None

    except Exception as exc:
        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.error(
            "calendar_service.create_event.error",
            calendar_id=calendar_id,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return None


def find_event_by_phone(
    calendar_id: str,
    credentials_dict: dict,
    phone_number: str,
    lookahead_hours: int = 72,
) -> str | None:
    """Busca el primer evento futuro cuya descripción contenga el phone_number del paciente.

    Args:
        calendar_id: ID del calendario del tenant.
        credentials_dict: Service account JSON ya deserializado.
        phone_number: Número del paciente a buscar.
        lookahead_hours: Ventana de búsqueda en horas (default 72).

    Returns:
        El event_id del primer evento encontrado, o None si no hay coincidencia.
    """
    t0 = _time.monotonic()

    try:
        credentials = service_account.Credentials.from_service_account_info(
            credentials_dict,
            scopes=SCOPES_WRITE,
        )
        service = build("calendar", "v3", credentials=credentials)

        now = datetime.now(timezone.utc)
        time_max = now + timedelta(hours=lookahead_hours)

        events_result = (
            service.events()
            .list(
                calendarId=calendar_id,
                timeMin=now.isoformat(),
                timeMax=time_max.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )

        token = _lookup_token(phone_number, calendar_id)
        token_marker = f"ref:{token}"
        for event in events_result.get("items", []):
            description = event.get("description", "") or ""
            # Primary: match opaque token (new format, no raw PII)
            # Fallback: match raw phone number (legacy events created before F0.2)
            if token_marker in description or phone_number in description:
                event_id = event.get("id")
                duration_ms = int((_time.monotonic() - t0) * 1000)
                logger.info(
                    "calendar_service.find_event_by_phone.found",
                    calendar_id=calendar_id,
                    event_id=event_id,
                    duration_ms=duration_ms,
                )
                return event_id

        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.info(
            "calendar_service.find_event_by_phone.not_found",
            calendar_id=calendar_id,
            phone_number=phone_number,
            duration_ms=duration_ms,
        )
        return None

    except Exception as exc:
        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.error(
            "calendar_service.find_event_by_phone.error",
            calendar_id=calendar_id,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return None


def delete_event(
    calendar_id: str,
    credentials_dict: dict,
    event_id: str,
) -> bool:
    """Elimina un evento de Google Calendar.

    Args:
        calendar_id: ID del calendario del tenant.
        credentials_dict: Service account JSON ya deserializado.
        event_id: ID del evento a eliminar.

    Returns:
        True si se eliminó exitosamente, False si falla (fail-safe).
    """
    t0 = _time.monotonic()

    try:
        credentials = service_account.Credentials.from_service_account_info(
            credentials_dict,
            scopes=SCOPES_WRITE,
        )
        service = build("calendar", "v3", credentials=credentials)
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()

        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.info(
            "calendar_service.delete_event.done",
            calendar_id=calendar_id,
            event_id=event_id,
            duration_ms=duration_ms,
        )
        return True

    except Exception as exc:
        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.error(
            "calendar_service.delete_event.error",
            calendar_id=calendar_id,
            event_id=event_id,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return False

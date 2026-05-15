"""Servicio de disponibilidad nativo (Supabase) — reemplaza calendar_service para tenants con uses_native_calendar=True."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.database import get_supabase_client
from app.core.logging import get_logger

logger = get_logger(__name__)

_TZ_ARG = ZoneInfo("America/Argentina/Buenos_Aires")

_MONTHS_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}
_DAYS_ES = {
    0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
    4: "Viernes", 5: "Sábado", 6: "Domingo",
}


def _format_display(dt: datetime) -> str:
    """Formatea un datetime en zona Argentina como 'Lunes 19 de Mayo, 10:00 hs'."""
    day_name = _DAYS_ES[dt.weekday()]
    month_name = _MONTHS_ES[dt.month]
    return f"{day_name} {dt.day} de {month_name}, {dt.strftime('%H:%M')} hs"


def _is_blocked(professional_id: str, check_date: date, blocks: list[dict]) -> bool:
    """Retorna True si el profesional está bloqueado en check_date."""
    for b in blocks:
        if b["professional_id"] != professional_id:
            continue
        date_from = date.fromisoformat(b["date_from"]) if isinstance(b["date_from"], str) else b["date_from"]
        date_to = date.fromisoformat(b["date_to"]) if isinstance(b["date_to"], str) else b["date_to"]
        if date_from <= check_date <= date_to:
            return True
    return False


def get_available_slots(
    tenant_id: str,
    service_id: str,
    duration_minutes: int,
    lookahead_hours: int,
    start_date: datetime | None = None,
) -> list[dict]:
    """Retorna los próximos slots disponibles para el servicio en el calendario nativo de Supabase.

    Drop-in replacement de calendar_service.get_available_slots para tenants con uses_native_calendar=True.
    Retorna máximo 3 slots, cada uno con {"start": str_iso, "end": str_iso, "display": str}.
    """
    try:
        client = get_supabase_client()

        # 1. Obtener profesionales del servicio
        sp_resp = (
            client.table("service_professionals")
            .select("professional_id")
            .eq("service_id", service_id)
            .execute()
        )
        professional_ids: list[str] = [row["professional_id"] for row in (sp_resp.data or [])]
        if not professional_ids:
            logger.info("availability_service.no_professionals", service_id=service_id)
            return []

        # 2. Obtener schedules de los profesionales
        schedules_resp = (
            client.table("professional_schedules")
            .select("professional_id,day_of_week,start_time,end_time")
            .in_("professional_id", professional_ids)
            .execute()
        )
        schedules: list[dict] = schedules_resp.data or []

        # 3. Calcular rango temporal
        from_dt = start_date.astimezone(_TZ_ARG) if start_date else datetime.now(_TZ_ARG)
        to_dt = from_dt + timedelta(hours=lookahead_hours)

        # 4. Turnos ya reservados en el rango
        booked_resp = (
            client.table("appointments")
            .select("professional_id,start_at,end_at")
            .eq("tenant_id", tenant_id)
            .eq("service_id", service_id)
            .eq("status", "confirmed")
            .gte("start_at", from_dt.isoformat())
            .lt("start_at", to_dt.isoformat())
            .execute()
        )
        booked: list[dict] = booked_resp.data or []

        # 5. Bloqueos de los profesionales en el rango
        blocks_resp = (
            client.table("blocked_times")
            .select("professional_id,date_from,date_to")
            .in_("professional_id", professional_ids)
            .lte("date_from", to_dt.date().isoformat())
            .gte("date_to", from_dt.date().isoformat())
            .execute()
        )
        blocks: list[dict] = blocks_resp.data or []

        # 6. Capacidad del servicio
        service_resp = (
            client.table("services")
            .select("capacity_per_slot")
            .eq("service_id", service_id)
            .maybe_single()
            .execute()
        )
        capacity_per_slot: int | None = None
        if service_resp.data:
            capacity_per_slot = service_resp.data.get("capacity_per_slot")

        # 7. Generar candidatos día a día
        now_arg = datetime.now(_TZ_ARG)
        duration = timedelta(minutes=duration_minutes)

        # Agrupar schedules por professional_id y day_of_week para búsqueda rápida
        # {professional_id: {day_of_week: [(start_time, end_time)]}}
        sched_map: dict[str, dict[int, list[tuple[time, time]]]] = {}
        for s in schedules:
            pid = s["professional_id"]
            dow = s["day_of_week"]
            # start_time / end_time pueden llegar como string "HH:MM:SS" o time object
            st = s["start_time"]
            et = s["end_time"]
            if isinstance(st, str):
                st = time.fromisoformat(st)
            if isinstance(et, str):
                et = time.fromisoformat(et)
            sched_map.setdefault(pid, {}).setdefault(dow, []).append((st, et))

        slots_found: list[dict] = []
        seen_starts: set[str] = set()

        current_date = from_dt.date()
        end_date = to_dt.date()

        while current_date <= end_date and len(slots_found) < 3:
            dow = current_date.weekday()  # 0=Lunes … 6=Domingo (coincide con DB)

            for pid in professional_ids:
                if len(slots_found) >= 3:
                    break

                # Verificar que el profesional no esté bloqueado hoy
                if _is_blocked(pid, current_date, blocks):
                    continue

                # Obtener franjas horarias del profesional para este día
                day_slots = sched_map.get(pid, {}).get(dow, [])
                for (start_t, end_t) in day_slots:
                    if len(slots_found) >= 3:
                        break

                    # Generar candidatos de slots en la franja
                    slot_time = datetime.combine(current_date, start_t, tzinfo=_TZ_ARG)
                    franja_end = datetime.combine(current_date, end_t, tzinfo=_TZ_ARG)

                    while slot_time + duration <= franja_end:
                        slot_end_dt = slot_time + duration

                        # Skip si está en el pasado
                        if slot_time < now_arg:
                            slot_time += duration
                            continue

                        # Skip si está antes del from_dt
                        if slot_time < from_dt:
                            slot_time += duration
                            continue

                        # FIX 3 — HIGH: Descartar slots que superan el límite de lookahead
                        if slot_time >= to_dt:
                            break

                        slot_start_iso = slot_time.isoformat()
                        slot_end_iso = slot_end_dt.isoformat()

                        # FIX 1 — BLOCKER: Comparar usando objetos datetime tz-aware (no strings con distintos offsets)
                        slot_dt_start = slot_time        # ya es tz-aware (_TZ_ARG)
                        slot_dt_end = slot_end_dt        # ya es tz-aware (_TZ_ARG)

                        # FIX 2 — HIGH: Separar lógica grupal vs individual por professional_id
                        if capacity_per_slot is not None:
                            # Grupal: contar todos los appointments del servicio en este slot
                            count = sum(
                                1 for b in booked
                                if datetime.fromisoformat(b["start_at"]) < slot_dt_end
                                and datetime.fromisoformat(b["end_at"]) > slot_dt_start
                            )
                            slot_available = count < capacity_per_slot
                        else:
                            # Individual: contar solo los appointments de ESTE profesional
                            count = sum(
                                1 for b in booked
                                if b.get("professional_id") == pid
                                and datetime.fromisoformat(b["start_at"]) < slot_dt_end
                                and datetime.fromisoformat(b["end_at"]) > slot_dt_start
                            )
                            slot_available = count < 1

                        if not slot_available:
                            slot_time += duration
                            continue

                        # Dedup por start iso (dos profesionales con mismo horario)
                        if slot_start_iso not in seen_starts:
                            seen_starts.add(slot_start_iso)
                            slots_found.append({
                                "start": slot_start_iso,
                                "end": slot_end_iso,
                                "display": _format_display(slot_time),
                            })
                            if len(slots_found) >= 3:
                                break

                        slot_time += duration

            current_date += timedelta(days=1)

        # Ordenar cronológicamente y retornar máximo 3
        slots_found.sort(key=lambda s: s["start"])
        return slots_found[:3]

    except Exception as exc:
        logger.warning(
            "availability_service.get_available_slots.error",
            service_id=service_id,
            error=str(exc),
        )
        return []


def resolve_professional_id(service_id: str | None) -> str | None:
    """Retorna el professional_id único del servicio, o None si hay 0 o 2+ profesionales (ambiguo).

    Drop-in helper para nodos que necesitan un professional_id determinista.
    """
    if service_id is None:
        return None
    try:
        client = get_supabase_client()
        resp = (
            client.table("service_professionals")
            .select("professional_id")
            .eq("service_id", service_id)
            .execute()
        )
        rows = resp.data or []
        if len(rows) == 1:
            return rows[0]["professional_id"]
        return None
    except Exception as exc:
        logger.warning(
            "availability_service.resolve_professional_id.error",
            service_id=service_id,
            error=str(exc),
        )
        return None

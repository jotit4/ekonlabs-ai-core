"""Tool: Google Calendar API para LangGraph — solo lectura (Story 3.1)."""
from __future__ import annotations

from langchain_core.tools import tool

from app.services import calendar_service


@tool
def check_calendar_availability(
    calendar_id: str,
    credentials_dict: dict,
    duration_minutes: int = 60,
    lookahead_hours: int = 72,
) -> list[dict]:
    """Consulta las franjas horarias libres en Google Calendar de un tenant.

    Args:
        calendar_id: ID del calendario del tenant.
        credentials_dict: Service account JSON ya deserializado.
        duration_minutes: Duración del turno en minutos (default 60).
        lookahead_hours: Ventana de búsqueda en horas (default 72).

    Returns:
        Lista de hasta 3 slots disponibles con claves: start, end, display.
        Lista vacía si no hay disponibilidad o si ocurre un error.
    """
    return calendar_service.get_available_slots(
        calendar_id=calendar_id,
        credentials_dict=credentials_dict,
        duration_minutes=duration_minutes,
        lookahead_hours=lookahead_hours,
    )

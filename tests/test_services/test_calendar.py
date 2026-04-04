"""Tests para app/services/calendar_service.py — get_available_slots() (Story 3.1)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

# Credenciales ficticias para tests (el build está mockeado)
_FAKE_CREDS = {
    "type": "service_account",
    "project_id": "test-project",
    "private_key_id": "key-id",
    "private_key": "fake-private-key",
    "client_email": "test@test-project.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}
_CALENDAR_ID = "test-calendar@group.calendar.google.com"

# Lunes 2026-03-30 09:00 UTC (día laboral)
_MONDAY = datetime(2026, 3, 30, 9, 0, 0, tzinfo=timezone.utc)


def _make_event(start: datetime, end: datetime) -> dict:
    """Helper para construir un evento de Google Calendar API."""
    return {
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": end.isoformat()},
    }


def _mock_service(events: list[dict], calendar_timezone: str = "UTC") -> MagicMock:
    """Retorna un mock de googleapiclient service con los eventos dados."""
    mock_service = MagicMock()
    mock_service.events.return_value.list.return_value.execute.return_value = {
        "items": events,
        "timeZone": calendar_timezone,
    }
    return mock_service


# ---------------------------------------------------------------------------
# Test 1 — Retorna hasta 3 opciones con calendario parcialmente ocupado
# ---------------------------------------------------------------------------
def test_get_available_slots_returns_up_to_3_options():
    """Calendario con 2 eventos en las próximas 72h → retorna <= 3 slots libres."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY  # Lunes 09:00 UTC
    # 2 eventos que ocupan 09:00-10:00 y 10:00-11:00
    events = [
        _make_event(now, now + timedelta(hours=1)),
        _make_event(now + timedelta(hours=1), now + timedelta(hours=2)),
    ]

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service(events)
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    assert isinstance(result, list)
    assert 1 <= len(result) <= 3
    for slot in result:
        assert "start" in slot
        assert "end" in slot
        assert "display" in slot


# ---------------------------------------------------------------------------
# Test 2 — Calendario completamente lleno → retorna []
# ---------------------------------------------------------------------------
def test_get_available_slots_no_free_time():
    """Calendario lleno Lun-Vie 09:00-18:00 durante 72h → retorna []."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY
    # Crear evento gigante que cubre todo el período laboral
    events = [
        _make_event(now, now + timedelta(hours=72)),
    ]

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service(events)
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    assert result == []


# ---------------------------------------------------------------------------
# Test 3 — Calendario vacío → retorna 3 opciones (todo libre)
# ---------------------------------------------------------------------------
def test_get_available_slots_empty_calendar():
    """Sin eventos en el calendario → retorna 3 slots libres."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service([])
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    assert len(result) == 3


# ---------------------------------------------------------------------------
# Test 4 — Huecos menores a duration_minutes no se retornan
# ---------------------------------------------------------------------------
def test_get_available_slots_slot_shorter_than_duration():
    """Huecos de 30min con duración 60min requerida → no retornados."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY
    # Evento de 09:00 a 09:30 — deja hueco de 30min antes de 10:00
    # Con slots generados en horas en punto, el 09:00 está ocupado → el candidato 10:00 es libre
    # Esto verifica que solo los slots de ≥ duration_minutes se ofrecen
    events = [
        _make_event(now, now + timedelta(minutes=30)),             # 09:00-09:30
        _make_event(now + timedelta(hours=1), now + timedelta(hours=2)),  # 10:00-11:00
    ]

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service(events)
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    # El slot 09:00 está ocupado (evento 09:00-09:30), el 10:00 está ocupado (evento 10:00-11:00)
    # Los candidatos libres empiezan desde 11:00
    assert len(result) <= 3
    for slot in result:
        start_dt = datetime.fromisoformat(slot["start"])
        end_dt = datetime.fromisoformat(slot["end"])
        assert (end_dt - start_dt).total_seconds() == 60 * 60  # exactamente 60 minutos


# ---------------------------------------------------------------------------
# Test 5 — Google API lanza excepción → retorna [] (fail-safe)
# ---------------------------------------------------------------------------
def test_get_available_slots_api_failure():
    """Si Google Calendar API falla → retorna [] sin propagar excepción."""
    from app.services.calendar_service import get_available_slots

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.side_effect = Exception("Google API connection error")

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS)

    assert result == []


# ---------------------------------------------------------------------------
# Test 6 — Verifica timing < 3 segundos (con mock es instantáneo)
# ---------------------------------------------------------------------------
def test_get_available_slots_completes_under_3s():
    """La función completa en menos de 3 segundos (con API mockeada)."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service([])
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        t0 = time.monotonic()
        get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)
        elapsed = time.monotonic() - t0

    assert elapsed < 3.0, f"La función tardó {elapsed:.2f}s, debe completar en < 3s"


# ---------------------------------------------------------------------------
# Test 7 — El campo 'display' es legible en español
# ---------------------------------------------------------------------------
def test_display_format_is_human_readable():
    """El campo 'display' de cada slot tiene formato legible en español."""
    from app.services.calendar_service import get_available_slots

    now = _MONDAY  # Lunes 2026-03-30 09:00 UTC

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service([])
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    assert len(result) >= 1
    display = result[0]["display"]
    # Debe contener nombre de día en español
    assert any(
        dia in display
        for dia in ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    )
    # Debe contener nombre de mes en español
    assert any(
        mes in display
        for mes in ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    )
    # Debe contener separador de hora
    assert "—" in display
    assert "hs" in display


# ---------------------------------------------------------------------------
# Test 8 — Usa timezone del calendario para retorno y display
# ---------------------------------------------------------------------------
def test_get_available_slots_uses_calendar_timezone():
    """Los slots devueltos deben respetar la timezone del calendario, no UTC fijo."""
    from app.services.calendar_service import get_available_slots

    now = datetime(2026, 3, 30, 12, 0, 0, tzinfo=timezone.utc)  # 09:00 en -03:00
    calendar_timezone = "America/Argentina/Buenos_Aires"

    with (
        patch("app.services.calendar_service.service_account") as mock_sa,
        patch("app.services.calendar_service.build") as mock_build,
        patch("app.services.calendar_service.datetime") as mock_dt,
    ):
        mock_sa.Credentials.from_service_account_info.return_value = MagicMock()
        mock_build.return_value = _mock_service([], calendar_timezone=calendar_timezone)
        mock_dt.now.return_value = now
        mock_dt.fromisoformat = datetime.fromisoformat

        result = get_available_slots(_CALENDAR_ID, _FAKE_CREDS, duration_minutes=60, lookahead_hours=72)

    assert len(result) >= 1
    assert result[0]["start"].endswith("-03:00")
    assert "09:00 a 10:00 hs" in result[0]["display"]

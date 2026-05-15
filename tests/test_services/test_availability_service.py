"""Tests para app/services/availability_service.py."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

_TZ_ARG = ZoneInfo("America/Argentina/Buenos_Aires")

_SERVICE_ID = "service-uuid-001"
_TENANT_ID = "tenant-uuid-001"
_PROF_ID_1 = "prof-uuid-001"
_PROF_ID_2 = "prof-uuid-002"

# Fecha fija en el futuro para evitar que los slots queden "en el pasado"
_FUTURE_DATE = datetime(2030, 6, 2, 8, 0, 0, tzinfo=_TZ_ARG)  # Lunes 02/06/2030, 08:00 ARG


def _mock_execute(data):
    """Crea un mock de la respuesta .execute() de Supabase con .data = data."""
    resp = MagicMock()
    resp.data = data
    return resp


def _build_supabase_mock(
    professionals: list[dict],
    schedules: list[dict],
    booked: list[dict],
    blocks: list[dict],
    service_data: dict | None = None,
):
    """Construye un mock del cliente Supabase que retorna los datos dados."""
    client = MagicMock()

    # Cada llamada a .table(...).select(...).eq(...) etc. termina en .execute()
    # Usamos side_effect por orden de llamada.
    execute_mock = MagicMock()
    execute_mock.side_effect = [
        _mock_execute(professionals),   # service_professionals
        _mock_execute(schedules),       # professional_schedules
        _mock_execute(booked),          # appointments
        _mock_execute(blocks),          # blocked_times
        _mock_execute(service_data if service_data is not None else {"capacity_per_slot": None}),  # services
    ]

    # Encadenar todos los métodos del query builder al mismo mock de execute
    query_chain = MagicMock()
    query_chain.select.return_value = query_chain
    query_chain.eq.return_value = query_chain
    query_chain.in_.return_value = query_chain
    query_chain.gte.return_value = query_chain
    query_chain.lte.return_value = query_chain
    query_chain.lt.return_value = query_chain
    query_chain.maybe_single.return_value = query_chain
    query_chain.execute = execute_mock

    client.table.return_value = query_chain
    return client


# ── get_available_slots ───────────────────────────────────────────────────────

class TestGetAvailableSlots:

    def test_no_professionals_returns_empty(self):
        """Sin profesionales para el servicio → retorna []."""
        client = _build_supabase_mock(
            professionals=[],
            schedules=[],
            booked=[],
            blocks=[],
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        assert result == []

    def test_professional_with_schedule_returns_slot(self):
        """Profesional con schedule para Lunes y un slot libre → retorna slot correctamente formateado.

        _FUTURE_DATE = 2030-06-02 08:00 ARG (Domingo, weekday=6).
        El primer Lunes (weekday=0) dentro del rango es 2030-06-03.
        """
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 0,  # Lunes (weekday=0) → primer Lunes es 03/06/2030
                "start_time": "09:00:00",
                "end_time": "18:00:00",
            }],
            booked=[],
            blocks=[],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        assert len(result) > 0
        first = result[0]
        assert "start" in first
        assert "end" in first
        assert "display" in first
        # Formato display: "Lunes 3 de Junio, 09:00 hs"
        assert "Lunes" in first["display"]
        assert "Junio" in first["display"]
        assert "09:00" in first["display"]
        assert "hs" in first["display"]

    def test_slot_occupied_is_skipped(self):
        """Slot ya ocupado (count >= capacity) → se omite.

        _FUTURE_DATE = 2030-06-02 (Domingo, weekday=6).
        Schedule solo para Domingo (day_of_week=6), 09:00–10:00.
        El slot del 02/06 está reservado. Con 20h de lookahead el 09/06 queda fuera.
        Resultado esperado: [].
        """
        # 2030-06-02 es Domingo (weekday=6)
        slot_start = datetime(2030, 6, 2, 9, 0, 0, tzinfo=_TZ_ARG)
        slot_end = datetime(2030, 6, 2, 10, 0, 0, tzinfo=_TZ_ARG)
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 6,  # Domingo
                "start_time": "09:00:00",
                "end_time": "10:00:00",  # Solo un slot posible en el rango
            }],
            booked=[{
                "professional_id": _PROF_ID_1,
                "start_at": slot_start.isoformat(),
                "end_at": slot_end.isoformat(),
            }],
            blocks=[],
            service_data={"capacity_per_slot": 1},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            # 20h lookahead: from 08:00 Dom 02/06 → hasta 04:00 Lun 03/06 (próximo Dom fuera del rango)
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 20, start_date=_FUTURE_DATE)

        assert result == []

    def test_blocked_professional_slot_omitted(self):
        """Profesional bloqueado ese día (blocked_times) → slot se omite."""
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 0,
                "start_time": "09:00:00",
                "end_time": "18:00:00",
            }],
            booked=[],
            blocks=[{
                "professional_id": _PROF_ID_1,
                "date_from": "2030-06-02",
                "date_to": "2030-06-04",
            }],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            # lookahead de 48h → solo cubre 02/06 (Lunes), que está bloqueado
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 48, start_date=_FUTURE_DATE)

        # El Lunes 02/06 está bloqueado y es el único día con schedule en 48h
        # (El martes 03/06 tampoco tiene schedule en este test, day_of_week=0 solo)
        assert result == []

    def test_past_slot_is_skipped(self):
        """Slot en el pasado → se omite."""
        # start_date en el pasado real — usar now_arg como referencia
        past_date = datetime(2020, 1, 6, 8, 0, 0, tzinfo=_TZ_ARG)  # Lunes 06/01/2020
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 0,
                "start_time": "09:00:00",
                "end_time": "10:00:00",
            }],
            booked=[],
            blocks=[],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=past_date)

        # Todos los slots del pasado deben omitirse
        assert result == []

    def test_max_three_slots_returned(self):
        """Múltiples slots disponibles → retorna máximo 3."""
        # Schedule con varios slots disponibles: 09:00–18:00 cada hora
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 0,  # Lunes
                "start_time": "09:00:00",
                "end_time": "18:00:00",
            }],
            booked=[],
            blocks=[],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        assert len(result) <= 3
        assert len(result) == 3  # hay 9 slots posibles (09:00–18:00), retorna solo 3

    def test_db_exception_returns_empty_failsafe(self):
        """Excepción en DB → retorna [] (fail-safe)."""
        client = MagicMock()
        client.table.side_effect = Exception("Connection error")

        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        assert result == []

    def test_utc_appointment_detected_as_overlap(self):
        """FIX 1 (BLOCKER): Un appointment guardado en UTC ('+00:00') se detecta correctamente
        como overlap contra un slot en ARG timezone, evitando double booking.

        El slot es 2030-06-03 09:00 ARG (-03:00) = 2030-06-03 12:00 UTC.
        El appointment está en UTC con el mismo instante.
        """
        # 2030-06-03 es Lunes (weekday=0)
        # Appointment guardado como UTC por Supabase
        slot_start_utc = "2030-06-03T12:00:00+00:00"   # = 09:00 ARG
        slot_end_utc = "2030-06-03T13:00:00+00:00"     # = 10:00 ARG

        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 0,  # Lunes → 03/06/2030
                "start_time": "09:00:00",
                "end_time": "10:00:00",  # Solo un slot posible
            }],
            booked=[{
                "professional_id": _PROF_ID_1,
                "start_at": slot_start_utc,
                "end_at": slot_end_utc,
            }],
            blocks=[],
            service_data={"capacity_per_slot": 1},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        # El slot 09:00 ARG debe detectarse como ocupado (mismo instante en UTC)
        assert result == [], (
            "El appointment UTC no fue detectado como overlap contra el slot ARG — double booking!"
        )

    def test_individual_service_two_professionals_independent_slots(self):
        """FIX 2 (HIGH): capacity_per_slot=None (servicio individual).
        P1 tiene appointment a las 09:00. El slot de P2 a las 09:00 debe seguir disponible.
        """
        # 2030-06-03 es Lunes (weekday=0)
        slot_start = datetime(2030, 6, 3, 9, 0, 0, tzinfo=_TZ_ARG)
        slot_end = datetime(2030, 6, 3, 10, 0, 0, tzinfo=_TZ_ARG)

        client = _build_supabase_mock(
            professionals=[
                {"professional_id": _PROF_ID_1},
                {"professional_id": _PROF_ID_2},
            ],
            schedules=[
                {
                    "professional_id": _PROF_ID_1,
                    "day_of_week": 0,
                    "start_time": "09:00:00",
                    "end_time": "10:00:00",
                },
                {
                    "professional_id": _PROF_ID_2,
                    "day_of_week": 0,
                    "start_time": "09:00:00",
                    "end_time": "10:00:00",
                },
            ],
            booked=[{
                "professional_id": _PROF_ID_1,  # Solo P1 tiene appointment
                "start_at": slot_start.isoformat(),
                "end_at": slot_end.isoformat(),
            }],
            blocks=[],
            service_data={"capacity_per_slot": None},  # Servicio individual
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        # P2 tiene el slot libre: debe aparecer en el resultado
        assert len(result) >= 1, (
            "El slot de P2 a las 09:00 fue bloqueado incorrectamente por el appointment de P1 "
            "(capacity_per_slot=None debería filtrar por professional_id)"
        )

    def test_slot_at_or_after_to_dt_is_discarded(self):
        """FIX 3 (HIGH): Slots que caen exactamente en to_dt o después quedan descartados,
        incluso si el día está dentro del rango de fechas.

        from_dt = 2030-06-02 08:00 ARG, lookahead = 1h → to_dt = 09:00 ARG.
        Schedule: 09:00–10:00. El slot de las 09:00 = to_dt → debe descartarse.
        """
        # Domingo 02/06/2030 (weekday=6)
        client = _build_supabase_mock(
            professionals=[{"professional_id": _PROF_ID_1}],
            schedules=[{
                "professional_id": _PROF_ID_1,
                "day_of_week": 6,  # Domingo
                "start_time": "09:00:00",
                "end_time": "10:00:00",
            }],
            booked=[],
            blocks=[],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            # lookahead=1h: to_dt = 09:00 ARG, el slot de 09:00 == to_dt → fuera del rango
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 1, start_date=_FUTURE_DATE)

        assert result == [], (
            "Un slot en to_dt o después no fue descartado — podría mostrar disponibilidad "
            "sin cobertura de DB."
        )

    def test_dedup_two_professionals_same_slot(self):
        """Dos profesionales con el mismo horario → slot aparece solo una vez."""
        client = _build_supabase_mock(
            professionals=[
                {"professional_id": _PROF_ID_1},
                {"professional_id": _PROF_ID_2},
            ],
            schedules=[
                {
                    "professional_id": _PROF_ID_1,
                    "day_of_week": 0,
                    "start_time": "09:00:00",
                    "end_time": "10:00:00",
                },
                {
                    "professional_id": _PROF_ID_2,
                    "day_of_week": 0,
                    "start_time": "09:00:00",
                    "end_time": "10:00:00",
                },
            ],
            booked=[],
            blocks=[],
            service_data={"capacity_per_slot": None},
        )
        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import get_available_slots
            result = get_available_slots(_TENANT_ID, _SERVICE_ID, 60, 72, start_date=_FUTURE_DATE)

        starts = [s["start"] for s in result]
        assert len(starts) == len(set(starts)), "Hay slots duplicados"


# ── resolve_professional_id ───────────────────────────────────────────────────

class TestResolveProfessionalId:

    def test_none_service_id_returns_none(self):
        """service_id None → None."""
        from app.services.availability_service import resolve_professional_id
        result = resolve_professional_id(None)
        assert result is None

    def test_single_professional_returns_id(self):
        """Un profesional → retorna su ID."""
        client = MagicMock()
        resp = MagicMock()
        resp.data = [{"professional_id": _PROF_ID_1}]
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value = resp
        client.table.return_value = chain

        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import resolve_professional_id
            result = resolve_professional_id(_SERVICE_ID)

        assert result == _PROF_ID_1

    def test_two_professionals_returns_none(self):
        """Dos profesionales → None (ambiguo)."""
        client = MagicMock()
        resp = MagicMock()
        resp.data = [{"professional_id": _PROF_ID_1}, {"professional_id": _PROF_ID_2}]
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value = resp
        client.table.return_value = chain

        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import resolve_professional_id
            result = resolve_professional_id(_SERVICE_ID)

        assert result is None

    def test_no_professionals_returns_none(self):
        """Sin profesionales → None."""
        client = MagicMock()
        resp = MagicMock()
        resp.data = []
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value = resp
        client.table.return_value = chain

        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import resolve_professional_id
            result = resolve_professional_id(_SERVICE_ID)

        assert result is None

    def test_db_exception_returns_none_failsafe(self):
        """Excepción en DB → None (fail-safe)."""
        client = MagicMock()
        client.table.side_effect = Exception("DB error")

        with patch("app.services.availability_service.get_supabase_client", return_value=client):
            from app.services.availability_service import resolve_professional_id
            result = resolve_professional_id(_SERVICE_ID)

        assert result is None

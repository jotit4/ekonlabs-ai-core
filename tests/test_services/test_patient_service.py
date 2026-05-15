"""Tests para app/services/patient_service.py."""
from unittest.mock import MagicMock, patch

_TENANT_ID = "tenant-uuid-ps"
_PHONE = "+5491199887766"
_PATIENT_ID = "patient-uuid-abc"
_APPT_ID = "appointment-uuid-xyz"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_patient_mock():
    """Patient-like object returned by get_patient_by_phone."""
    patient = MagicMock()
    patient.patient_id = _PATIENT_ID
    return patient


def _fake_appointment_row():
    return {
        "appointment_id": _APPT_ID,
        "tenant_id": _TENANT_ID,
        "patient_id": _PATIENT_ID,
        "service_id": None,
        "calendar_event_id": None,
        "start_at": "2026-06-01T10:00:00+00:00",
        "end_at": "2026-06-01T11:00:00+00:00",
        "status": "confirmed",
        "booked_via": "whatsapp",
    }


# ---------------------------------------------------------------------------
# create_appointment — professional_id
# ---------------------------------------------------------------------------

def test_create_appointment_without_professional_id_does_not_include_key():
    """create_appointment sin professional_id → insert_data no incluye la clave 'professional_id'."""
    row = _fake_appointment_row()
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[row])

    captured_insert_data = {}

    def capture_insert(data):
        captured_insert_data.update(data)
        return mock_client.table.return_value.insert.return_value

    mock_client.table.return_value.insert.side_effect = capture_insert

    with patch("app.services.patient_service.get_supabase_client", return_value=mock_client):
        from app.services.patient_service import create_appointment
        create_appointment(
            tenant_id=_TENANT_ID,
            patient_id=_PATIENT_ID,
            service_id=None,
            calendar_event_id=None,
            start_iso="2026-06-01T10:00:00+00:00",
            end_iso="2026-06-01T11:00:00+00:00",
        )

    assert "professional_id" not in captured_insert_data


def test_create_appointment_with_professional_id_includes_key():
    """create_appointment con professional_id → insert_data incluye 'professional_id'."""
    row = _fake_appointment_row()
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[row])

    captured_insert_data = {}

    def capture_insert(data):
        captured_insert_data.update(data)
        return mock_client.table.return_value.insert.return_value

    mock_client.table.return_value.insert.side_effect = capture_insert

    with patch("app.services.patient_service.get_supabase_client", return_value=mock_client):
        from app.services.patient_service import create_appointment
        create_appointment(
            tenant_id=_TENANT_ID,
            patient_id=_PATIENT_ID,
            service_id=None,
            calendar_event_id=None,
            start_iso="2026-06-01T10:00:00+00:00",
            end_iso="2026-06-01T11:00:00+00:00",
            professional_id="prof-uuid-001",
        )

    assert captured_insert_data.get("professional_id") == "prof-uuid-001"


# ---------------------------------------------------------------------------
# find_upcoming_appointment
# ---------------------------------------------------------------------------

def test_find_upcoming_appointment_patient_not_found_returns_none():
    """find_upcoming_appointment cuando el paciente no existe → None."""
    with patch("app.services.patient_service.get_patient_by_phone", return_value=None):
        from app.services.patient_service import find_upcoming_appointment
        result = find_upcoming_appointment(_TENANT_ID, _PHONE)

    assert result is None


def test_find_upcoming_appointment_no_appointments_returns_none():
    """find_upcoming_appointment con paciente existente pero sin appointments → None."""
    mock_client = MagicMock()
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .gte.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = MagicMock(data=[])

    with (
        patch("app.services.patient_service.get_patient_by_phone", return_value=_make_patient_mock()),
        patch("app.services.patient_service.get_supabase_client", return_value=mock_client),
    ):
        from app.services.patient_service import find_upcoming_appointment
        result = find_upcoming_appointment(_TENANT_ID, _PHONE)

    assert result is None


def test_find_upcoming_appointment_with_confirmed_appointment_returns_dict():
    """find_upcoming_appointment con appointment confirmado → retorna el dict."""
    appt_row = _fake_appointment_row()
    mock_client = MagicMock()
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .gte.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = MagicMock(data=[appt_row])

    with (
        patch("app.services.patient_service.get_patient_by_phone", return_value=_make_patient_mock()),
        patch("app.services.patient_service.get_supabase_client", return_value=mock_client),
    ):
        from app.services.patient_service import find_upcoming_appointment
        result = find_upcoming_appointment(_TENANT_ID, _PHONE)

    assert result is not None
    assert result["appointment_id"] == _APPT_ID
    assert result["status"] == "confirmed"


# ---------------------------------------------------------------------------
# cancel_appointment_by_id
# ---------------------------------------------------------------------------

def _make_cancel_by_id_client(has_data: bool = True):
    """Mock client for cancel_appointment_by_id."""
    mock_client = MagicMock()
    response_data = [{"appointment_id": _APPT_ID}] if has_data else []
    (
        mock_client.table.return_value
        .update.return_value
        .eq.return_value
        .execute.return_value
    ) = MagicMock(data=response_data)
    return mock_client


def test_cancel_appointment_by_id_found_returns_true():
    """cancel_appointment_by_id cuando encuentra el registro → True."""
    mock_client = _make_cancel_by_id_client(has_data=True)

    with patch("app.services.patient_service.get_supabase_client", return_value=mock_client):
        from app.services.patient_service import cancel_appointment_by_id
        result = cancel_appointment_by_id(_APPT_ID)

    assert result is True


def test_cancel_appointment_by_id_not_found_returns_false():
    """cancel_appointment_by_id sin registro → False."""
    mock_client = _make_cancel_by_id_client(has_data=False)

    with patch("app.services.patient_service.get_supabase_client", return_value=mock_client):
        from app.services.patient_service import cancel_appointment_by_id
        result = cancel_appointment_by_id(_APPT_ID)

    assert result is False


def test_cancel_appointment_by_id_exception_returns_false():
    """cancel_appointment_by_id ante excepción → False (fail-safe)."""
    mock_client = MagicMock()
    (
        mock_client.table.return_value
        .update.return_value
        .eq.return_value
        .execute.side_effect
    ) = Exception("DB connection lost")

    with patch("app.services.patient_service.get_supabase_client", return_value=mock_client):
        from app.services.patient_service import cancel_appointment_by_id
        result = cancel_appointment_by_id(_APPT_ID)

    assert result is False

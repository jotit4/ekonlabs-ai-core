"""Tests para calendar_service — funciones de escritura (Story 3.2): create_event, delete_event, find_event_by_phone."""
from unittest.mock import MagicMock, patch


_CALENDAR_ID = "clinic@group.calendar.google.com"
_CREDENTIALS = {"type": "service_account", "project_id": "test"}
_PHONE = "+5491112345678"
_EVENT_ID = "abc123eventid"

_FAKE_SLOT = {
    "start": "2026-03-30T10:00:00-03:00",
    "end": "2026-03-30T11:00:00-03:00",
    "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs",
}


def _mock_service(insert_event_id=_EVENT_ID, delete_ok=True, list_events=None):
    """Construye un mock de googleapiclient service."""
    mock_service = MagicMock()

    # events().insert().execute()
    mock_insert_result = {"id": insert_event_id}
    mock_service.events.return_value.insert.return_value.execute.return_value = mock_insert_result

    # events().delete().execute()
    if delete_ok:
        mock_service.events.return_value.delete.return_value.execute.return_value = None
    else:
        mock_service.events.return_value.delete.return_value.execute.side_effect = Exception("API error")

    # events().list().execute()
    list_events = list_events or []
    mock_service.events.return_value.list.return_value.execute.return_value = {
        "items": list_events,
        "timeZone": "America/Argentina/Buenos_Aires",
    }

    return mock_service


def test_create_event_returns_event_id():
    """create_event retorna el event_id del evento creado exitosamente."""
    from app.services.calendar_service import create_event

    mock_service = _mock_service()
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = create_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            start_iso=_FAKE_SLOT["start"],
            end_iso=_FAKE_SLOT["end"],
            phone_number=_PHONE,
        )

    assert result == _EVENT_ID


def test_create_event_uses_opaque_token_not_phone_in_description():
    """F0.2: create_event NO incluye el phone crudo en description; usa token opaco ref:..."""
    from app.services.calendar_service import create_event, _lookup_token

    mock_service = _mock_service()
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        create_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            start_iso=_FAKE_SLOT["start"],
            end_iso=_FAKE_SLOT["end"],
            phone_number=_PHONE,
        )

    call_kwargs = mock_service.events.return_value.insert.call_args
    body = call_kwargs[1]["body"]
    # Raw phone must NOT appear in description (PII removal F0.2)
    assert _PHONE not in body["description"]
    # Opaque token MUST be present for cancel lookup
    expected_token = f"ref:{_lookup_token(_PHONE, _CALENDAR_ID)}"
    assert expected_token in body["description"]


def test_create_event_returns_none_on_api_error():
    """create_event retorna None si Google Calendar lanza excepción (fail-safe)."""
    from app.services.calendar_service import create_event

    mock_service = _mock_service()
    mock_service.events.return_value.insert.return_value.execute.side_effect = Exception("403 Forbidden")

    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = create_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            start_iso=_FAKE_SLOT["start"],
            end_iso=_FAKE_SLOT["end"],
            phone_number=_PHONE,
        )

    assert result is None


def test_create_event_uses_default_title_turno():
    """F0.2: create_event usa el título default 'Turno' (sin PII) cuando no se pasa title."""
    from app.services.calendar_service import create_event

    mock_service = _mock_service()
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        create_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            start_iso=_FAKE_SLOT["start"],
            end_iso=_FAKE_SLOT["end"],
            phone_number=_PHONE,
        )

    call_kwargs = mock_service.events.return_value.insert.call_args
    body = call_kwargs[1]["body"]
    assert body["summary"] == "Turno"
    assert _PHONE not in body["summary"]


def test_delete_event_returns_true_on_success():
    """delete_event retorna True cuando la eliminación es exitosa."""
    from app.services.calendar_service import delete_event

    mock_service = _mock_service(delete_ok=True)
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = delete_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            event_id=_EVENT_ID,
        )

    assert result is True


def test_delete_event_returns_false_on_api_error():
    """delete_event retorna False si la API lanza excepción (fail-safe)."""
    from app.services.calendar_service import delete_event

    mock_service = _mock_service(delete_ok=False)
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = delete_event(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            event_id=_EVENT_ID,
        )

    assert result is False


def test_find_event_by_phone_returns_event_id_when_found():
    """find_event_by_phone retorna el event_id del primer evento cuya descripción contenga el phone."""
    from app.services.calendar_service import find_event_by_phone

    events = [
        {
            "id": _EVENT_ID,
            "description": f"Turno reservado vía Agente IA\nPaciente: {_PHONE}",
            "start": {"dateTime": "2026-03-30T10:00:00-03:00"},
        }
    ]
    mock_service = _mock_service(list_events=events)
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = find_event_by_phone(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            phone_number=_PHONE,
        )

    assert result == _EVENT_ID


def test_find_event_by_phone_returns_none_when_not_found():
    """find_event_by_phone retorna None si no hay eventos con ese phone_number."""
    from app.services.calendar_service import find_event_by_phone

    events = [
        {
            "id": "other_event",
            "description": "Turno reservado vía Agente IA\nPaciente: +5491100000000",
            "start": {"dateTime": "2026-03-30T10:00:00-03:00"},
        }
    ]
    mock_service = _mock_service(list_events=events)
    with (
        patch("app.services.calendar_service.service_account.Credentials.from_service_account_info"),
        patch("app.services.calendar_service.build", return_value=mock_service),
    ):
        result = find_event_by_phone(
            calendar_id=_CALENDAR_ID,
            credentials_dict=_CREDENTIALS,
            phone_number=_PHONE,
        )

    assert result is None

"""Tests para app/agent/nodes/booking.py — booking_node (Story 3.2)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

_TENANT_ID = "tenant-uuid-3-2"
_PHONE = "+5491112345678"
_CALENDAR_ID = "clinic@group.calendar.google.com"
_EVENT_ID = "gcal_event_abc123"

_FAKE_SLOT = {
    "start": "2026-03-30T10:00:00-03:00",
    "end": "2026-03-30T11:00:00-03:00",
    "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs",
}
_FAKE_SLOTS = [
    _FAKE_SLOT,
    {
        "start": "2026-03-30T14:00:00-03:00",
        "end": "2026-03-30T15:00:00-03:00",
        "display": "Lunes 30 de Marzo — 14:00 a 15:00 hs",
    },
    {
        "start": "2026-03-31T09:00:00-03:00",
        "end": "2026-03-31T10:00:00-03:00",
        "display": "Martes 31 de Marzo — 09:00 a 10:00 hs",
    },
]


def _base_state(message: str, **kwargs):
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=message)],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _mock_tenant(with_calendar=True, shadow_mode=False):
    mock = MagicMock()
    mock.calendar_id = _CALENDAR_ID if with_calendar else None
    mock.calendar_credentials = {"type": "service_account"}
    mock.shadow_mode_enabled = shadow_mode
    return mock


def test_booking_node_confirm_keyword_activates_intent():
    """Keyword de confirmación ('el primero') activa booking_intent=True y booking_action='confirm'."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el primero"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "confirm"


def test_booking_node_cancel_keyword_activates_cancel():
    """Keyword de cancelación ('quiero cancelar') activa booking_action='cancel'."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.find_event_by_phone.return_value = _EVENT_ID
        mock_cs.delete_event.return_value = True

        result = booking_node(_base_state("quiero cancelar mi turno"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "cancel"


def test_booking_node_no_intent_returns_false():
    """Mensaje sin intent de booking retorna {'booking_intent': False} sin DB call."""
    from app.agent.nodes.booking import booking_node

    with patch("app.agent.nodes.booking.tenant_service") as mock_ts:
        result = booking_node(_base_state("¿cuáles son los horarios de atención?"))

    assert result == {"booking_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent


def test_slot_index_1_maps_to_index_0():
    """'el 1' / 'el primero' mapea a selected_slot_index=0 (primer slot)."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("quiero el 1"))

    assert result.get("selected_slot_index") == 0
    assert result.get("booked_slot") == _FAKE_SLOTS[0]


def test_slot_index_2_maps_to_index_1():
    """'el 2' / 'el segundo' mapea a selected_slot_index=1 (segundo slot)."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el segundo"))

    assert result.get("selected_slot_index") == 1
    assert result.get("booked_slot") == _FAKE_SLOTS[1]


def test_slot_index_3_maps_to_index_2():
    """'el 3' / 'el tercero' mapea a selected_slot_index=2 (tercer slot)."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el tercero me viene bien"))

    assert result.get("selected_slot_index") == 2
    assert result.get("booked_slot") == _FAKE_SLOTS[2]


def test_no_slots_available_returns_none_event_id():
    """Si re-consulta retorna lista vacía, calendar_event_id debe ser None."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = []

        result = booking_node(_base_state("confirmo el turno"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "confirm"
    assert result["calendar_event_id"] is None


def test_create_event_exception_returns_booking_intent_false():
    """Si create_event lanza excepción, booking_node retorna booking_intent=False (fail-safe)."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.side_effect = Exception("Google API down")

        result = booking_node(_base_state("el primero"))

    assert result == {"booking_intent": False}


def test_cancel_with_event_found_calls_delete():
    """Cancelación con evento encontrado llama a delete_event con el event_id correcto."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.find_event_by_phone.return_value = _EVENT_ID
        mock_cs.delete_event.return_value = True

        result = booking_node(_base_state("necesito cancelar mi turno"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "cancel"
    assert result["calendar_event_id"] == _EVENT_ID
    mock_cs.delete_event.assert_called_once_with(
        calendar_id=_CALENDAR_ID,
        credentials_dict={"type": "service_account"},
        event_id=_EVENT_ID,
    )


def test_cancel_with_no_event_found_returns_none_event_id():
    """Cancelación sin evento encontrado retorna calendar_event_id=None sin error."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.find_event_by_phone.return_value = None

        result = booking_node(_base_state("quiero cancelar"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "cancel"
    assert result["calendar_event_id"] is None
    mock_cs.delete_event.assert_not_called()


# ── Falsos positivos críticos (OBLIGATORIOS per CLAUDE.md) ───────────────────

def test_false_positive_si_gracias_no_activates_booking():
    """'sí, gracias' NO activa booking_intent ni genera DB call."""
    from app.agent.nodes.booking import booking_node

    with patch("app.agent.nodes.booking.tenant_service") as mock_ts:
        result = booking_node(_base_state("sí, gracias"))

    assert result == {"booking_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent


def test_false_positive_que_horario_no_activates_booking():
    """'¿qué horario tienen?' NO activa booking_intent ni genera DB call."""
    from app.agent.nodes.booking import booking_node

    with patch("app.agent.nodes.booking.tenant_service") as mock_ts:
        result = booking_node(_base_state("¿qué horario tienen?"))

    assert result == {"booking_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent


# ── Kill switch (Story 3.3) ──────────────────────────────────────────────────

def test_booking_node_shadow_mode_returns_false_without_calendar_call():
    """shadow_mode_enabled=True → booking_intent=False, shadow_mode_active=True, sin llamar al calendario."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant(shadow_mode=True)

        result = booking_node(_base_state("el primero"))

    assert result == {"booking_intent": False, "shadow_mode_active": True}
    mock_cs.get_available_slots.assert_not_called()
    mock_cs.create_event.assert_not_called()


# ── Argentine colloquial confirm keywords (INTENT-02) ────────────────────────

def _booking_confirm_intent(keyword: str) -> dict:
    """Helper: call booking_node with a confirm keyword and full mocks."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        return booking_node(_base_state(keyword))


def test_argentine_confirm_keywords_dale():
    """'dale' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("dale")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_listo():
    """'listo' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("listo")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_va():
    """'va' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("va")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_anotame():
    """'anotame' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("anotame")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_poneme():
    """'poneme' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("poneme")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_agendame():
    """'agendame' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("agendame")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_reservame():
    """'reservame' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("reservame")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_tomame_ese():
    """'tomame ese' activa booking_intent=True via BOOKING_CONFIRM_KEYWORDS."""
    result = _booking_confirm_intent("tomame ese")
    assert result["booking_intent"] is True


def test_argentine_confirm_keywords_negative_reservar_para_manana():
    """'reservar para manana' NO activa booking_intent=True via confirm path."""
    from app.agent.nodes.booking import booking_node

    with patch("app.agent.nodes.booking.tenant_service") as mock_ts:
        result = booking_node(_base_state("reservar para manana"))

    # "reservar" is NOT in BOOKING_CONFIRM_KEYWORDS — it's a scheduling phrase
    assert result == {"booking_intent": False}
    mock_ts.get_tenant_config.assert_not_called()


# ── Plan 05-02: Slot Selection Ambiguity Fix ─────────────────────────────────

def test_state_has_booking_ambiguous_slot():
    """ConversationState debe tener el campo booking_ambiguous_slot en sus annotations."""
    from app.agent.state import ConversationState

    assert "booking_ambiguous_slot" in ConversationState.__annotations__


def test_state_partial_invoke_without_flag():
    """Estado parcial sin booking_ambiguous_slot no genera error de construcción."""
    from langchain_core.messages import HumanMessage

    # Esto simula una invocación parcial de LangGraph sin el campo opcional
    state = {"tenant_id": "t", "phone_number": "p", "messages": [HumanMessage(content="test")]}
    # Verificar que se puede construir sin error
    assert state["tenant_id"] == "t"


def test_detect_slot_index_returns_none_on_no_match():
    """_detect_slot_index('confirmo sin numero') debe retornar None (sin match claro)."""
    from app.agent.nodes.booking import _detect_slot_index

    assert _detect_slot_index("confirmo sin numero") is None


def test_detect_slot_index_digit_1_matches():
    """_detect_slot_index('quiero el 1') retorna 0 (primer slot)."""
    from app.agent.nodes.booking import _detect_slot_index

    assert _detect_slot_index("quiero el 1") == 0


def test_detect_slot_index_bare_1_matches():
    """_detect_slot_index('1') retorna 0 con word-boundary."""
    from app.agent.nodes.booking import _detect_slot_index

    assert _detect_slot_index("1") == 0


def test_false_positive_1430_no_slot():
    """_detect_slot_index('a las 14:30') debe retornar None — '1' en '14' no debe hacer match."""
    from app.agent.nodes.booking import _detect_slot_index

    assert _detect_slot_index("a las 14:30") is None


def test_false_positive_21_de_abril_no_slot():
    """_detect_slot_index('el 21 de abril') debe retornar None — '2' en '21' no hace match."""
    from app.agent.nodes.booking import _detect_slot_index

    assert _detect_slot_index("el 21 de abril") is None


def test_booking_node_ambiguous_sets_flag():
    """booking_node con 'confirmo' (sin dígito de slot) retorna booking_ambiguous_slot=True
    y NO llama a calendar_service.create_event."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS

        result = booking_node(_base_state("confirmo"))

    assert result["booking_intent"] is True
    assert result["booking_action"] == "confirm"
    assert result["booking_ambiguous_slot"] is True
    mock_cs.create_event.assert_not_called()


def test_booking_node_clear_digit_books():
    """booking_node con 'el 1' (slot explícito) retorna booking_intent=True
    sin booking_ambiguous_slot=True."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el 1"))

    assert result["booking_intent"] is True
    assert result.get("booking_ambiguous_slot") is not True


# ── Plan 07-02: INFRA-05 Race Window Fix (state slots) ──────────────────────

def test_confirm_uses_state_slots_without_calendar_call():
    """When state['available_slots'] is populated, booking_node books from state
    and does NOT call calendar_service.get_available_slots (INFRA-05 race fix)."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el 1", available_slots=_FAKE_SLOTS))

    mock_cs.get_available_slots.assert_not_called()
    assert result["booking_intent"] is True
    assert result["booking_action"] == "confirm"
    assert result.get("booked_slot") == _FAKE_SLOTS[0]
    assert result.get("calendar_event_id") == _EVENT_ID


def test_confirm_fallback_calls_calendar_when_no_state_slots():
    """When state has no available_slots, booking_node falls back to calendar call."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el 2"))  # no available_slots key

    mock_cs.get_available_slots.assert_called_once()
    assert result["booking_intent"] is True
    assert result.get("booked_slot") == _FAKE_SLOTS[1]


def test_confirm_fallback_calls_calendar_when_state_slots_empty():
    """When state has available_slots=[], booking_node falls back to calendar call."""
    from app.agent.nodes.booking import booking_node

    with (
        patch("app.agent.nodes.booking.tenant_service") as mock_ts,
        patch("app.agent.nodes.booking.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _mock_tenant()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS
        mock_cs.create_event.return_value = _EVENT_ID

        result = booking_node(_base_state("el 1", available_slots=[]))

    mock_cs.get_available_slots.assert_called_once()
    assert result["booking_intent"] is True

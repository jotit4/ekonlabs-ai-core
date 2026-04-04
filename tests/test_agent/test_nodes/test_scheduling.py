"""Tests para app/agent/nodes/scheduling.py — scheduling_node (Story 3.1)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"
_CALENDAR_ID = "clinic@group.calendar.google.com"

_FAKE_SLOTS = [
    {"start": "2026-03-30T10:00:00+00:00", "end": "2026-03-30T11:00:00+00:00", "display": "Lunes 30 de Marzo — 10:00 a 11:00 hs"},
    {"start": "2026-03-30T11:00:00+00:00", "end": "2026-03-30T12:00:00+00:00", "display": "Lunes 30 de Marzo — 11:00 a 12:00 hs"},
]


def _base_state(**kwargs) -> dict:
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _tenant_config_with_calendar(calendar_id: str = _CALENDAR_ID, credentials: dict | None = None) -> MagicMock:
    tenant = MagicMock()
    tenant.calendar_id = calendar_id
    tenant.calendar_credentials = credentials or {"type": "service_account"}
    tenant.shadow_mode_enabled = False
    return tenant


def _tenant_config_no_calendar() -> MagicMock:
    tenant = MagicMock()
    tenant.calendar_id = None
    tenant.calendar_credentials = None
    tenant.shadow_mode_enabled = False
    return tenant


def _tenant_config_shadow_mode() -> MagicMock:
    tenant = MagicMock()
    tenant.calendar_id = _CALENDAR_ID
    tenant.calendar_credentials = {"type": "service_account"}
    tenant.shadow_mode_enabled = True
    return tenant


# ---------------------------------------------------------------------------
# Tests de detección de intención de agendamiento
# ---------------------------------------------------------------------------

def test_scheduling_node_detects_turno_keyword():
    """'quiero sacar turno' → scheduling_intent = True."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero sacar turno para el lunes")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True
    assert "available_slots" in result
    assert result["available_slots"] == _FAKE_SLOTS


def test_scheduling_node_detects_cita_keyword():
    """'quiero una cita' → scheduling_intent = True."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero una cita con el doctor")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True


def test_scheduling_node_detects_agendar_keyword():
    """'quiero agendar' → scheduling_intent = True."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="necesito agendar una consulta")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = []

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True


def test_scheduling_node_detects_disponibilidad_keyword():
    """'hay disponibilidad' → scheduling_intent = True."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="¿hay disponibilidad esta semana?")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True


# ---------------------------------------------------------------------------
# Tests de falsos positivos — mensajes generales NO activan scheduling
# ---------------------------------------------------------------------------

def test_scheduling_node_no_intent_for_general_query():
    """'¿cuáles son los horarios de atención?' → scheduling_intent = False sin DB call."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="¿qué horario tienen?")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent
    mock_cs.get_available_slots.assert_not_called()


def test_scheduling_node_no_intent_for_medical_query():
    """'tengo fiebre alta' → scheduling_intent = False sin DB call."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="tengo fiebre alta desde ayer")])

    with patch("app.agent.nodes.scheduling.tenant_service") as mock_ts:
        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent


def test_scheduling_node_no_intent_for_information_availability_query():
    """'disponibilidad de información' no debe activar el flujo de scheduling ni DB call."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="¿hay disponibilidad de información sobre implantes?")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent
    mock_cs.get_available_slots.assert_not_called()


def test_scheduling_node_no_intent_for_quiero_consultar_precios():
    """'quiero consultar precios' es consulta general — sin DB call."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero consultar precios del tratamiento")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent
    mock_cs.get_available_slots.assert_not_called()


def test_scheduling_node_no_intent_empty_messages():
    """Sin mensajes → scheduling_intent = False sin DB call ni llamada al calendario."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent
    mock_cs.get_available_slots.assert_not_called()


# ---------------------------------------------------------------------------
# Test — Tenant sin calendar_id configurado
# ---------------------------------------------------------------------------

def test_scheduling_node_no_calendar_id_returns_empty_slots():
    """Tenant sin calendar_id → scheduling_intent=True, available_slots=[]."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero reservar un turno")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_no_calendar()

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True
    assert result["available_slots"] == []
    mock_cs.get_available_slots.assert_not_called()


# ---------------------------------------------------------------------------
# Test — API calendar falla → fail-safe scheduling_intent=False
# ---------------------------------------------------------------------------

def test_scheduling_node_calendar_api_failure_returns_false():
    """Si calendar_service lanza excepción → scheduling_intent=False (fail-safe)."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero agendar un turno")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.side_effect = Exception("Google API error")

        result = scheduling_node(state)

    assert result == {"scheduling_intent": False}


# ---------------------------------------------------------------------------
# Test — Con slots disponibles → available_slots tiene hasta 3 items
# ---------------------------------------------------------------------------

def test_scheduling_node_returns_slots_when_available():
    """Con slots disponibles → available_slots contiene hasta 3 dicts."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="cuándo tienen disponible")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = _FAKE_SLOTS

        result = scheduling_node(state)

    assert result["scheduling_intent"] is True
    assert len(result["available_slots"]) == len(_FAKE_SLOTS)
    assert result["available_slots"][0]["display"] == _FAKE_SLOTS[0]["display"]


# ---------------------------------------------------------------------------
# Test — calendar_service llamado con parámetros correctos
# ---------------------------------------------------------------------------

def test_scheduling_node_calls_calendar_service_with_correct_params():
    """scheduling_node llama a calendar_service.get_available_slots con parámetros exactos."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero sacar turno")])
    creds = {"type": "service_account", "project_id": "my-project"}

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        patch("app.agent.nodes.scheduling.settings") as mock_settings,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar(
            calendar_id=_CALENDAR_ID, credentials=creds
        )
        mock_cs.get_available_slots.return_value = []
        mock_settings.DEFAULT_SLOT_DURATION_MINUTES = 60
        mock_settings.SCHEDULING_LOOKAHEAD_HOURS = 72

        scheduling_node(state)

    mock_cs.get_available_slots.assert_called_once_with(
        calendar_id=_CALENDAR_ID,
        credentials_dict=creds,
        duration_minutes=60,
        lookahead_hours=72,
    )


# ---------------------------------------------------------------------------
# Test — Solo el último HumanMessage se analiza
# ---------------------------------------------------------------------------

def test_scheduling_node_reads_last_human_message():
    """Solo el último HumanMessage se analiza — sin DB call si no hay intent."""
    from app.agent.nodes.scheduling import scheduling_node

    # El primer mensaje tiene keyword de scheduling, el último no
    messages = [
        HumanMessage(content="quiero agendar un turno"),
        AIMessage(content="Por supuesto, te ayudo"),
        HumanMessage(content="gracias, eso es todo"),
    ]
    state = _base_state(messages=messages)

    with patch("app.agent.nodes.scheduling.tenant_service") as mock_ts:
        result = scheduling_node(state)

    # El último HumanMessage ("gracias, eso es todo") no tiene keywords
    assert result == {"scheduling_intent": False}
    mock_ts.get_tenant_config.assert_not_called()  # no DB call para no-intent


# ---------------------------------------------------------------------------
# Test — Kill switch shadow_mode_enabled=True
# ---------------------------------------------------------------------------

def test_scheduling_node_shadow_mode_returns_false_without_calendar_call():
    """shadow_mode_enabled=True → scheduling_intent=False, shadow_mode_active=True, sin llamar al calendario."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero agendar un turno")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_shadow_mode()

        result = scheduling_node(state)

    assert result == {"scheduling_intent": False, "shadow_mode_active": True}
    mock_cs.get_available_slots.assert_not_called()


# ---------------------------------------------------------------------------
# Test — tenant_service.get_tenant_config es llamado con tenant_id correcto
# ---------------------------------------------------------------------------

def test_scheduling_node_calls_tenant_service_with_tenant_id():
    """scheduling_node llama a tenant_service.get_tenant_config con el tenant_id del state."""
    from app.agent.nodes.scheduling import scheduling_node

    state = _base_state(messages=[HumanMessage(content="quiero una cita")])

    with (
        patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
        patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
    ):
        mock_ts.get_tenant_config.return_value = _tenant_config_with_calendar()
        mock_cs.get_available_slots.return_value = []

        scheduling_node(state)

    mock_ts.get_tenant_config.assert_called_once_with(_TENANT_ID)


# ---------------------------------------------------------------------------
# Tests — INTENT-05: dead code removal + new phrases + rename (Plan 05-01)
# ---------------------------------------------------------------------------

def test_quiero_atencion_scheduling_intent():
    """'quiero atención' → has_scheduling_intent returns True."""
    from app.agent.nodes.scheduling import has_scheduling_intent

    assert has_scheduling_intent("quiero atención") is True


def test_hay_algo_manana_scheduling_intent():
    """'hay algo para mañana' → has_scheduling_intent returns True."""
    from app.agent.nodes.scheduling import has_scheduling_intent

    assert has_scheduling_intent("hay algo para mañana") is True


def test_quisiera_pedir_hora_scheduling_intent():
    """'quisiera pedir hora' → has_scheduling_intent returns True."""
    from app.agent.nodes.scheduling import has_scheduling_intent

    assert has_scheduling_intent("quisiera pedir hora") is True


def test_scheduling_intent_keywords_removed():
    """SCHEDULING_INTENT_KEYWORDS dead frozenset must NOT exist on the module."""
    import app.agent.nodes.scheduling as m

    assert not hasattr(m, "SCHEDULING_INTENT_KEYWORDS"), (
        "Dead code SCHEDULING_INTENT_KEYWORDS is still present in scheduling.py"
    )


def test_has_scheduling_intent_negative_cuando_abren():
    """'cuando abren' → has_scheduling_intent returns False (negative pattern)."""
    from app.agent.nodes.scheduling import has_scheduling_intent

    assert has_scheduling_intent("cuando abren") is False


def test_has_scheduling_intent_negative_quiero_consultar_precios():
    """'quiero consultar precios' → has_scheduling_intent returns False."""
    from app.agent.nodes.scheduling import has_scheduling_intent

    assert has_scheduling_intent("quiero consultar precios") is False

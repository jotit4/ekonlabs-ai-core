"""Tests para Turn 4 del flujo de agendamiento.

Turn 4: paciente envía su DNI ("32456789") → agente crea evento en Calendar y confirma reserva.

Flujo de nodos:
    triage → anti_diagnostic → booking → scheduling → rag_retrieval → generation

Cobertura de este archivo:
    1. booking_node — re-hidratación con dni_collection_active (INFRA-06)
    2. _extract_dni — función pura de extracción de DNI argentino
    3. generation_node — Fase B (extracción DNI) + _finalize_registration (Fase C)
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

_TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"
_PHONE = "+5491155550004"
_CALENDAR_ID = "clinic@group.calendar.google.com"
_EVENT_ID = "gcal_event_turn4_xyz"
_PATIENT_NAME = "Juan Pérez"
_DNI = "32456789"

_FAKE_SLOT = {
    "start": "2026-04-10T10:00:00-03:00",
    "end": "2026-04-10T11:00:00-03:00",
    "display": "Viernes 10 de Abril — 10:00 a 11:00 hs",
}

_FAKE_DRAFT_DNI_ACTIVE = {
    "name_collection_active": False,
    "dni_collection_active": True,
    "patient_name": _PATIENT_NAME,
    "booked_slot": _FAKE_SLOT,
    "selected_slot_index": 1,
    "dni_attempts": 1,
    "patient_dni": None,
}


def _base_state(message: str = _DNI, **kwargs) -> dict:
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=message)],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _make_mock_llm(response_text: str = "¡Perfecto, Juan Pérez! Tu turno quedó reservado.") -> MagicMock:
    mock = MagicMock()
    ai_msg = AIMessage(content=response_text)
    mock.invoke.return_value = ai_msg
    mock.bind_tools.return_value.invoke.return_value = ai_msg
    return mock


def _mock_patient(patient_id: str = "patient-uuid-001", full_name: str = _PATIENT_NAME, dni: str = _DNI):
    p = MagicMock()
    p.patient_id = patient_id
    p.full_name = full_name
    p.dni = dni
    return p


def _mock_tenant(calendar_id: str = _CALENDAR_ID, credentials: dict | None = None):
    t = MagicMock()
    t.calendar_id = calendar_id
    t.calendar_credentials = credentials or {"type": "service_account"}
    t.shadow_mode_enabled = False
    return t


# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 1 — booking_node: re-hidratación dni_collection_active (INFRA-06)
# ─────────────────────────────────────────────────────────────────────────────

class TestBookingNodeTurn4Rehydration:
    """booking_node en Turn 4 debe re-hidratar desde Redis cuando dni_collection_active=True."""

    def test_dni_message_with_active_draft_rehydrates(self):
        """'32456789' + draft {dni_collection_active: True} → re-hidrata, booking_intent=True."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            result = booking_node(_base_state(_DNI))

        assert result["booking_intent"] is True
        assert result["booking_action"] == "confirm"

    def test_rehydration_propagates_patient_name(self):
        """Re-hidratación propaga patient_name del draft al state retornado."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            result = booking_node(_base_state(_DNI))

        assert result.get("patient_name") == _PATIENT_NAME

    def test_rehydration_propagates_booked_slot(self):
        """Re-hidratación propaga booked_slot del draft al state retornado."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            result = booking_node(_base_state(_DNI))

        assert result.get("booked_slot") == _FAKE_SLOT

    def test_rehydration_propagates_dni_collection_active(self):
        """Re-hidratación propaga dni_collection_active=True del draft."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            result = booking_node(_base_state(_DNI))

        assert result.get("dni_collection_active") is True

    def test_rehydration_does_not_call_tenant_service(self):
        """Re-hidratación NO llama a tenant_service.get_tenant_config (sin DB call)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            booking_node(_base_state(_DNI))

        mock_ts.get_tenant_config.assert_not_called()

    def test_rehydration_does_not_call_calendar_service(self):
        """Re-hidratación NO llama a calendar_service (sin API call a Google)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            booking_node(_base_state(_DNI))

        mock_cs.create_event.assert_not_called()
        mock_cs.get_available_slots.assert_not_called()

    def test_draft_with_both_flags_false_no_rehydration(self):
        """Draft con dni_collection_active=False y name_collection_active=False → NO re-hidrata → booking_intent=False."""
        from app.agent.nodes.booking import booking_node

        inactive_draft = {
            "name_collection_active": False,
            "dni_collection_active": False,
            "patient_name": _PATIENT_NAME,
            "booked_slot": _FAKE_SLOT,
        }

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = inactive_draft

            result = booking_node(_base_state(_DNI))

        assert result == {"booking_intent": False}

    def test_no_draft_returns_booking_intent_false(self):
        """Sin draft en Redis → booking_intent=False (comportamiento normal sin registration)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state(_DNI))

        assert result == {"booking_intent": False}

    def test_rehydration_reads_correct_tenant_and_phone(self):
        """booking_draft_service.get_draft es llamado con tenant_id y phone_number correctos."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = _FAKE_DRAFT_DNI_ACTIVE

            booking_node(_base_state(_DNI))

        mock_draft.get_draft.assert_called_once_with(_TENANT_ID, _PHONE)


# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 2 — _extract_dni: función pura
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractDni:
    """_extract_dni debe extraer DNI argentino de 7-8 dígitos en múltiples formatos."""

    def test_plain_8_digits(self):
        """'32456789' → '32456789'."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("32456789") == "32456789"

    def test_dotted_format(self):
        """'32.456.789' → '32456789' (quita puntos separadores de miles)."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("32.456.789") == "32456789"

    def test_natural_phrase_mi_dni_es(self):
        """'mi DNI es 32456789' → '32456789'."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("mi DNI es 32456789") == "32456789"

    def test_prefix_dni_colon(self):
        """'DNI: 32456789' → '32456789'."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("DNI: 32456789") == "32456789"

    def test_prefix_documento(self):
        """'documento 32456789' → '32456789'."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("documento 32456789") == "32456789"

    def test_prefix_es_el(self):
        """'es el 32456789' → '32456789'."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("es el 32456789") == "32456789"

    def test_7_digits_valid(self):
        """'1234567' (7 dígitos) → '1234567' (válido, DNI viejo)."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("1234567") == "1234567"

    def test_6_digits_invalid(self):
        """'123456' (6 dígitos) → None (muy corto)."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("123456") is None

    def test_9_digits_invalid(self):
        """'123456789' (9 dígitos) → None (muy largo para DNI argentino)."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("123456789") is None

    def test_no_tengo_returns_none(self):
        """'no tengo' → None."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("no tengo") is None

    def test_empty_string_returns_none(self):
        """'' → None."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("") is None

    def test_mixed_text_no_digits(self):
        """Texto sin dígitos → None."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("no recuerdo el número") is None

    def test_dotted_8_digit_stripped(self):
        """Formato con puntos seguido de texto → extrae dígitos correctamente."""
        from app.agent.nodes.generation import _extract_dni
        assert _extract_dni("mi dni es 32.456.789") == "32456789"


# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 3 — generation_node: Fase B (extracción DNI) + _finalize_registration
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerationNodeTurn4PhaseB:
    """generation_node en Turn 4: gate de registration activo + Fase B DNI + Fase C finalización."""

    def _make_turn4_state(self, message: str = _DNI, **kwargs) -> dict:
        """State típico de Turn 4 re-hidratado desde Redis."""
        state = {
            "tenant_id": _TENANT_ID,
            "phone_number": _PHONE,
            "messages": [HumanMessage(content=message)],
            "confidence_score": 1.0,
            "is_paused": False,
            # Campos re-hidratados del draft
            "booking_intent": True,
            "booking_action": "confirm",
            "dni_collection_active": True,
            "name_collection_active": False,
            "patient_name": _PATIENT_NAME,
            "booked_slot": _FAKE_SLOT,
            "dni_attempts": 1,
        }
        state.update(kwargs)
        return state

    def _mock_services_patch(self, event_id: str = _EVENT_ID, patient_id: str = "patient-001"):
        """Retorna los patches necesarios para _finalize_registration."""
        mock_patient = _mock_patient(patient_id=patient_id)
        mock_tenant_config = _mock_tenant()

        return mock_patient, mock_tenant_config

    # ── Fase B: extracción e invocación de _finalize_registration ──────────────

    def test_phase_b_calls_finalize_registration(self):
        """dni_collection_active=True, dni_attempts=1, mensaje '32456789' → llama _finalize_registration."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        # _finalize_registration se ejecutó → create_event fue llamado
        mock_cs.create_event.assert_called_once()

    def test_phase_b_does_not_use_bind_tools(self):
        """Registration path usa _get_llm().invoke() (NO bind_tools)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        mock_llm.bind_tools.assert_not_called()
        mock_llm.invoke.assert_called_once()

    # ── _finalize_registration: llamadas a servicios externos ──────────────────

    def test_finalize_calls_get_or_create_patient(self):
        """_finalize_registration llama patient_service.get_or_create_patient con los datos correctos."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        mock_ps.get_or_create_patient.assert_called_once_with(
            tenant_id=_TENANT_ID,
            phone_number=_PHONE,
            full_name=_PATIENT_NAME,
            dni=_DNI,
        )

    def test_finalize_calls_calendar_create_event(self):
        """_finalize_registration llama calendar_service.create_event con patient_name y dni."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        call_kwargs = mock_cs.create_event.call_args[1]
        assert call_kwargs["patient_name"] == _PATIENT_NAME
        assert call_kwargs["dni"] == _DNI

    def test_finalize_calls_create_appointment(self):
        """_finalize_registration llama patient_service.create_appointment."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient(patient_id="patient-uuid-999")

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        mock_ps.create_appointment.assert_called_once()
        call_kwargs = mock_ps.create_appointment.call_args[1]
        assert call_kwargs["calendar_event_id"] == _EVENT_ID

    def test_finalize_calls_delete_draft(self):
        """_finalize_registration llama booking_draft_service.delete_draft (limpia Redis)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        mock_draft.delete_draft.assert_called_once_with(_TENANT_ID, _PHONE)

    # ── State final retornado por generation_node ──────────────────────────────

    def test_final_state_has_calendar_event_id(self):
        """El event_id retornado por create_event aparece en el state final (calendar_event_id)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert result.get("calendar_event_id") == _EVENT_ID

    def test_final_state_name_collection_active_false(self):
        """State final tiene name_collection_active=False."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert result.get("name_collection_active") is False

    def test_final_state_dni_collection_active_false(self):
        """State final tiene dni_collection_active=False."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert result.get("dni_collection_active") is False

    def test_final_state_patient_name_preserved(self):
        """State final preserva patient_name."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert result.get("patient_name") == _PATIENT_NAME

    def test_final_state_patient_dni_set(self):
        """State final tiene patient_dni con el DNI extraído."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert result.get("patient_dni") == _DNI

    def test_final_state_has_ai_message(self):
        """State final contiene messages=[AIMessage] con la confirmación del turno."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm("¡Perfecto, Juan Pérez! Tu turno quedó reservado. 😊")
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(self._make_turn4_state(_DNI))

        assert "messages" in result
        assert len(result["messages"]) == 1
        assert isinstance(result["messages"][0], AIMessage)

    def test_llm_context_includes_slot_display(self):
        """El SystemMessage enviado al LLM contiene el display del booked_slot."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(_DNI))

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert isinstance(system_msg, SystemMessage)
        assert _FAKE_SLOT["display"] in system_msg.content

    # ── Título del evento en Calendar ──────────────────────────────────────────

    def test_event_title_with_service_name(self):
        """Si hay selected_service_name: título = '{service_name} — {patient_name}'."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            generation_node(self._make_turn4_state(
                _DNI,
                selected_service_name="Kinesiología",
            ))

        call_kwargs = mock_cs.create_event.call_args[1]
        assert call_kwargs["title"] == f"Kinesiología — {_PATIENT_NAME}"

    def test_event_title_without_service_name(self):
        """Sin selected_service_name: título = 'Turno — {patient_name}'."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            # Sin selected_service_name
            generation_node(self._make_turn4_state(_DNI))

        call_kwargs = mock_cs.create_event.call_args[1]
        assert call_kwargs["title"] == f"Turno — {_PATIENT_NAME}"

    # ── Path: DNI no dado tras 2 intentos ─────────────────────────────────────

    def test_dni_skipped_after_2_attempts_calls_finalize_with_none_dni(self):
        """dni_attempts >= 2 sin DNI extraído → llama _finalize_registration con dni=None."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        state = self._make_turn4_state(
            "no recuerdo el número",  # mensaje sin DNI válido
            dni_attempts=2,
        )

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(state)

        # El evento se crea igual, con dni=None
        mock_cs.create_event.assert_called_once()
        call_kwargs = mock_cs.create_event.call_args[1]
        assert call_kwargs["dni"] is None

    def test_dni_skipped_event_still_created(self):
        """Cuando se salta el DNI, el evento en Calendar se crea igualmente."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        mock_patient = _mock_patient()

        state = self._make_turn4_state(
            "no lo sé",  # mensaje sin DNI válido
            dni_attempts=2,
        )

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = _EVENT_ID
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = []

            result = generation_node(state)

        assert result.get("calendar_event_id") == _EVENT_ID
        assert result.get("dni_collection_active") is False

    def test_dni_attempt_1_no_match_asks_again(self):
        """dni_attempts=1 con mensaje sin DNI válido → pide DNI de nuevo (no _finalize_registration)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm("¿Me podés dar tu DNI?")

        state = self._make_turn4_state(
            "no me acuerdo",  # mensaje sin DNI válido
            dni_attempts=1,
        )

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            result = generation_node(state)

        # No crea evento
        mock_cs.create_event.assert_not_called()
        # Retorna el turno de DNI re-preguntado
        assert "messages" in result
        assert isinstance(result["messages"][0], AIMessage)

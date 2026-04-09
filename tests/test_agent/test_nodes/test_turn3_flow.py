"""Tests para Turn 3 del flujo de agendamiento.

Turn 3: paciente dice "Juan Pérez" → el agente extrae su nombre y pide DNI.

Estado del state al inicio del Turn 3:
    - name_collection_active=True (viene del draft re-hidratado)
    - name_attempts=1 (ya se preguntó en Turn 2)
    - booked_slot={...} (slot elegido en Turn 2)
    - booking_intent=True

Nodos relevantes:
    - booking_node: re-hidratación INFRA-06 — lee draft Redis cuando no hay keyword
    - _extract_patient_name: función pura de extracción de nombre
    - generation_node: Fase A con name_attempts=1 → extrae nombre, activa Fase B (DNI)
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

_TENANT_ID = "cccccccc-dddd-eeee-ffff-000000000003"
_PHONE = "+5491155550003"
_CALENDAR_ID = "clinic-turn3@group.calendar.google.com"
_SERVICE_ID = "33333333-cccc-cccc-cccc-cccccccccccc"

_FAKE_SLOT = {
    "start": "2026-04-10T10:00:00-03:00",
    "end": "2026-04-10T11:00:00-03:00",
    "display": "Viernes 10 de Abril — 10:00 a 11:00 hs",
}

_FAKE_SLOTS = [
    _FAKE_SLOT,
    {
        "start": "2026-04-10T11:00:00-03:00",
        "end": "2026-04-10T12:00:00-03:00",
        "display": "Viernes 10 de Abril — 11:00 a 12:00 hs",
    },
    {
        "start": "2026-04-10T14:00:00-03:00",
        "end": "2026-04-10T15:00:00-03:00",
        "display": "Viernes 10 de Abril — 14:00 a 15:00 hs",
    },
]

# Slot timestamp fresco (menos de 30 minutos atrás)
_FRESH_SLOT_TS = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()


def _base_state(message: str = "Juan Pérez", **kwargs) -> dict:
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=message)],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _name_collection_state(message: str = "Juan Pérez", name_attempts: int = 1, **kwargs) -> dict:
    """State que representa el inicio de Turn 3: name_collection_active, ya se preguntó nombre."""
    return _base_state(
        message,
        name_collection_active=True,
        booked_slot=_FAKE_SLOT,
        slot_presented_at=_FRESH_SLOT_TS,
        name_attempts=name_attempts,
        booking_intent=True,
        **kwargs,
    )


def _make_mock_llm(response_text: str = "¿Me podés dar tu DNI?") -> MagicMock:
    mock = MagicMock()
    ai_msg = AIMessage(content=response_text)
    mock.invoke.return_value = ai_msg
    mock.bind_tools.return_value.invoke.return_value = ai_msg
    return mock


def _make_draft(name_collection_active: bool = True, **kwargs) -> dict:
    """Construye un draft Redis típico del Turn 3 (generado en Turn 2)."""
    draft = {
        "name_collection_active": name_collection_active,
        "booked_slot": _FAKE_SLOT,
        "selected_slot_index": 1,
        "selected_service_name": "Kinesiología",
        "selected_service_id": _SERVICE_ID,
        "slot_presented_at": _FRESH_SLOT_TS,
        "name_attempts": 1,
        "patient_name": None,
        "dni_collection_active": False,
        "dni_attempts": 0,
        "patient_dni": None,
    }
    draft.update(kwargs)
    return draft


# =============================================================================
# SECCIÓN 1: _extract_patient_name — función pura
# =============================================================================

class TestExtractPatientName:
    """Tests directos de la función _extract_patient_name (app/agent/nodes/generation.py)."""

    def _call(self, text: str):
        from app.agent.nodes.generation import _extract_patient_name
        return _extract_patient_name(text)

    def test_canonical_full_name(self):
        """'Juan Pérez' → 'Juan Pérez'."""
        assert self._call("Juan Pérez") == "Juan Pérez"

    def test_prefix_me_llamo(self):
        """'me llamo Juan Pérez' → 'Juan Pérez'."""
        assert self._call("me llamo Juan Pérez") == "Juan Pérez"

    def test_prefix_si_me_llamo(self):
        """'sí, me llamo Juan Pérez' → 'Juan Pérez'."""
        assert self._call("sí, me llamo Juan Pérez") == "Juan Pérez"

    def test_prefix_claro(self):
        """'claro, Juan Pérez' → 'Juan Pérez'."""
        assert self._call("claro, Juan Pérez") == "Juan Pérez"

    def test_prefix_dale(self):
        """'dale, Juan Pérez' → 'Juan Pérez'."""
        assert self._call("dale, Juan Pérez") == "Juan Pérez"

    def test_compound_surname(self):
        """'María José López García' (4 palabras, apellido compuesto) → retorna el nombre completo."""
        result = self._call("María José López García")
        assert result == "María José López García"

    def test_six_words_max_ok(self):
        """'María José López García Martínez' (5 palabras) → retorna el nombre."""
        result = self._call("María José López García Martínez")
        assert result is not None
        assert "María" in result

    def test_only_digits_returns_none(self):
        """'32456789' (solo número) → None (tiene dígitos, no es nombre)."""
        assert self._call("32456789") is None

    def test_single_word_returns_none(self):
        """'Juan' (una sola palabra) → None (necesita mínimo 2 palabras)."""
        assert self._call("Juan") is None

    def test_seven_words_returns_none(self):
        """7 palabras → None (excede el máximo de 6 palabras)."""
        assert self._call("Juan Pérez López García Martínez Rodríguez García") is None

    def test_trailing_emoji_stripped(self):
        """'Juan Pérez 😊' → 'Juan Pérez' (emoji trailing se strip)."""
        result = self._call("Juan Pérez 😊")
        assert result == "Juan Pérez"

    def test_leading_exclamation_stripped(self):
        """'¡Juan Pérez!' → 'Juan Pérez' (puntuación inicial y final se strip)."""
        result = self._call("¡Juan Pérez!")
        assert result == "Juan Pérez"


# =============================================================================
# SECCIÓN 2: booking_node — re-hidratación INFRA-06 (Turn 3)
# =============================================================================

class TestBookingNodeTurn3Rehydration:
    """booking_node en Turn 3: 'Juan Pérez' no está en keywords → re-hidratación INFRA-06."""

    def test_name_message_with_active_draft_rehydrates(self):
        """'Juan Pérez' + draft con name_collection_active=True → booking_intent=True."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True)

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft

            result = booking_node(_base_state("Juan Pérez"))

        assert result["booking_intent"] is True
        assert result["booking_action"] == "confirm"

    def test_rehydration_includes_booked_slot(self):
        """Re-hidratación incluye booked_slot del draft en el resultado."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True)

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            result = booking_node(_base_state("Juan Pérez"))

        assert result.get("booked_slot") == _FAKE_SLOT

    def test_rehydration_includes_selected_slot_index(self):
        """Re-hidratación incluye selected_slot_index del draft."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True, selected_slot_index=1)

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            result = booking_node(_base_state("Juan Pérez"))

        assert result.get("selected_slot_index") == 1

    def test_rehydration_includes_selected_service_name(self):
        """Re-hidratación incluye selected_service_name del draft."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True, selected_service_name="Kinesiología")

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            result = booking_node(_base_state("Juan Pérez"))

        assert result.get("selected_service_name") == "Kinesiología"

    def test_no_draft_returns_booking_intent_false(self):
        """Sin draft (draft=None) → booking_intent=False, no re-hidrata."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None
            result = booking_node(_base_state("Juan Pérez"))

        assert result == {"booking_intent": False}
        mock_ts.get_tenant_config.assert_not_called()

    def test_draft_with_inactive_name_collection_no_rehydrate(self):
        """Draft con name_collection_active=False y dni_collection_active=False → no re-hidrata → booking_intent=False."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=False, dni_collection_active=False)

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            result = booking_node(_base_state("Juan Pérez"))

        assert result == {"booking_intent": False}
        mock_ts.get_tenant_config.assert_not_called()

    def test_rehydration_does_not_call_tenant_service(self):
        """Durante re-hidratación NO se llama a tenant_service.get_tenant_config."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True)

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            booking_node(_base_state("Juan Pérez"))

        mock_ts.get_tenant_config.assert_not_called()

    def test_rehydration_does_not_call_calendar_service(self):
        """Durante re-hidratación NO se llama a calendar_service (ni get_slots ni create_event)."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True)

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            booking_node(_base_state("Juan Pérez"))

        mock_cs.get_available_slots.assert_not_called()
        mock_cs.create_event.assert_not_called()

    def test_rehydration_reads_draft_with_tenant_and_phone(self):
        """booking_node llama get_draft con tenant_id y phone_number correctos."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(name_collection_active=True)

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            booking_node(_base_state("Juan Pérez"))

        mock_draft.get_draft.assert_called_once_with(_TENANT_ID, _PHONE)

    def test_dni_collection_active_also_triggers_rehydration(self):
        """Draft con dni_collection_active=True también dispara re-hidratación."""
        from app.agent.nodes.booking import booking_node

        draft = _make_draft(
            name_collection_active=False,
            dni_collection_active=True,
            patient_name="Juan Pérez",
        )

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = draft
            result = booking_node(_base_state("32456789"))

        assert result["booking_intent"] is True
        assert result["booking_action"] == "confirm"
        mock_ts.get_tenant_config.assert_not_called()


# =============================================================================
# SECCIÓN 3: generation_node — Fase A name_attempts=1 (Turn 3)
# =============================================================================

class TestGenerationNodeTurn3NameCapture:
    """generation_node en Turn 3: name_collection_active=True, name_attempts=1, paciente da su nombre."""

    def test_name_provided_transitions_to_dni_phase(self):
        """name_attempts=1, 'Juan Pérez' → extrae nombre, activa Fase B (dni_collection_active=True)."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm()),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            result = generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        assert result.get("patient_name") == "Juan Pérez"
        assert result.get("name_collection_active") is False
        assert result.get("dni_collection_active") is True

    def test_name_provided_sets_dni_attempts_to_1(self):
        """Tras capturar el nombre, dni_attempts=1 (el LLM ya pidió DNI en esta respuesta)."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm()),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        assert result.get("dni_attempts") == 1

    def test_name_provided_returns_ai_message(self):
        """generation_node retorna messages=[AIMessage]."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm("¿Me podés dar tu DNI?")),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        assert "messages" in result
        assert len(result["messages"]) == 1
        assert isinstance(result["messages"][0], AIMessage)

    def test_system_message_contains_pedir_dni(self):
        """El SystemMessage enviado al LLM contiene 'PEDIR DNI'."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert isinstance(system_msg, SystemMessage)
        assert "PEDIR DNI" in system_msg.content

    def test_system_message_contains_patient_name(self):
        """El SystemMessage menciona el nombre extraído del paciente."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert "Juan Pérez" in system_msg.content

    def test_uses_invoke_not_bind_tools(self):
        """Fase A extracción de nombre: _llm.invoke() es llamado, NO bind_tools."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        mock_llm.invoke.assert_called_once()
        mock_llm.bind_tools.assert_not_called()

    def test_update_draft_called_with_correct_fields(self):
        """booking_draft_service.update_draft se llama con patient_name, dni_collection_active=True, dni_attempts=1."""
        from app.agent.nodes.generation import generation_node

        mock_draft = MagicMock()

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm()),
            patch("app.agent.nodes.generation.booking_draft_service", mock_draft),
        ):
            generation_node(_name_collection_state("Juan Pérez", name_attempts=1))

        mock_draft.update_draft.assert_called_once_with(
            _TENANT_ID,
            _PHONE,
            {
                "patient_name": "Juan Pérez",
                "name_collection_active": False,
                "dni_collection_active": True,
                "dni_attempts": 1,
            },
        )

    def test_name_attempts_2_without_name_triggers_handoff(self):
        """name_attempts=2 y sin nombre extraíble → is_paused=True (handoff humano)."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm("Te paso con un asesor.")),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            # "no, prefiero no" no es extraíble como nombre
            result = generation_node(_name_collection_state("no, prefiero no", name_attempts=2))

        assert result.get("is_paused") is True
        assert result.get("name_collection_active") is False

    def test_name_attempts_1_without_name_asks_again(self):
        """name_attempts=1 y mensaje sin nombre válido → re-pregunta, incrementa name_attempts."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm("¿Podés decirme tu nombre completo?")),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            # "dale" tiene una sola palabra → no es nombre válido
            result = generation_node(_name_collection_state("dale", name_attempts=1))

        assert result.get("name_attempts") == 2
        assert result.get("patient_name") is None
        assert result.get("dni_collection_active") is not True

    def test_name_attempts_1_without_name_no_handoff_yet(self):
        """Con name_attempts=1 y sin nombre → aún no es handoff (is_paused debe ser falsy)."""
        from app.agent.nodes.generation import generation_node

        with (
            patch("app.agent.nodes.generation._llm", _make_mock_llm()),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(_name_collection_state("dale", name_attempts=1))

        assert result.get("is_paused") is not True

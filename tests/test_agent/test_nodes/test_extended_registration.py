"""Tests para F-ISADI-3 — Captura extendida de datos del paciente (Fase D).

Cubre:
- Paciente particular → se salta afiliado implícitamente
- OS válida → extracción bulk exitosa
- Bulk capture exitoso → todos los campos en un turno
- Bulk capture fallido → retry (extended_attempts++)
- Tras 2 intentos fallidos → finaliza con datos parciales (no bloquea turno)
- _extract_extended_data: parsea JSON correcto, ignora null, soporta código fences
- Trigger condition: extended_collection_active dispara _handle_registration
"""
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.generation import generation_node, _extract_extended_data

_TENANT = "tenant-isadi-uuid"
_PHONE = "+5491155443322"
_BOOKED_SLOT = {
    "start": "2026-04-30T09:00:00",
    "end": "2026-04-30T10:00:00",
    "display": "Miércoles 30 de abril a las 9:00 hs",
}


def _extended_state(extended_attempts=0, **kwargs):
    """State with name+DNI already collected and Phase D active."""
    base = {
        "tenant_id": _TENANT,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="Hola, quiero turno")],
        "patient_name": "Ana García",
        "patient_dni": "33456789",
        "name_collection_active": False,
        "dni_collection_active": False,
        "extended_collection_active": True,
        "extended_attempts": extended_attempts,
        "booked_slot": _BOOKED_SLOT,
        "booking_intent": False,
        "is_medical_query": False,
        "is_paused": False,
    }
    base.update(kwargs)
    return base


class TestExtractExtendedData:
    """Unit tests for _extract_extended_data() LLM extractor."""

    def test_returns_empty_dict_on_empty_input(self):
        result = _extract_extended_data("")
        assert result == {}

    def test_returns_empty_dict_on_whitespace(self):
        result = _extract_extended_data("   ")
        assert result == {}

    def test_maps_json_fields_to_state_keys(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(
            content='{"obra_social": "OSEP", "obra_social_number": "123456", '
                    '"reason_for_visit": "rodilla", "alternative_phone": null, "address": null}'
        )
        with patch("app.agent.nodes.generation._get_llm", return_value=mock_llm):
            result = _extract_extended_data("Tengo OSEP, afiliado 123456, me duele la rodilla")

        assert result["patient_obra_social"] == "OSEP"
        assert result["patient_obra_social_number"] == "123456"
        assert result["patient_motivo"] == "rodilla"
        assert "patient_alt_phone" not in result
        assert "patient_address" not in result

    def test_particular_maps_correctly(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(
            content='{"obra_social": "particular", "obra_social_number": null, '
                    '"reason_for_visit": null, "alternative_phone": null, "address": null}'
        )
        with patch("app.agent.nodes.generation._get_llm", return_value=mock_llm):
            result = _extract_extended_data("Soy particular")

        assert result["patient_obra_social"] == "particular"
        assert "patient_obra_social_number" not in result

    def test_strips_markdown_code_fences(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(
            content='```json\n{"obra_social": "Sancor", "obra_social_number": null, '
                    '"reason_for_visit": null, "alternative_phone": null, "address": null}\n```'
        )
        with patch("app.agent.nodes.generation._get_llm", return_value=mock_llm):
            result = _extract_extended_data("Tengo Sancor")

        assert result["patient_obra_social"] == "Sancor"

    def test_returns_empty_on_invalid_json(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="no es JSON válido")
        with patch("app.agent.nodes.generation._get_llm", return_value=mock_llm):
            result = _extract_extended_data("algo raro")

        assert result == {}

    def test_returns_empty_on_llm_exception(self):
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = RuntimeError("API error")
        with patch("app.agent.nodes.generation._get_llm", return_value=mock_llm):
            result = _extract_extended_data("Tengo OSEP")

        assert result == {}


class TestExtendedCollectionTrigger:
    """extended_collection_active=True must route to _handle_registration, bypassing other paths."""

    def test_extended_active_bypasses_booking_path(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="¿Cuál es tu obra social?")

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = {}
            state = _extended_state(extended_attempts=0)
            result = generation_node(state)

        assert result.get("messages")
        # booking path would use booking_intent — we didn't set it and LLM was called

    def test_extended_active_not_name_collection(self):
        """extended_collection_active=True should fire even when name_collection_active=False."""
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Por favor, indicame tu obra social")

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = {}
            state = _extended_state(extended_attempts=0, name_collection_active=False)
            result = generation_node(state)

        assert result.get("messages")
        assert isinstance(result["messages"][0], AIMessage)


class TestExtendedPhaseD:
    """Tests for the Phase D block inside _handle_registration."""

    def test_first_turn_asks_extended_data(self):
        """extended_attempts=0 → ask for data (no extraction attempt yet)."""
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="¿Tenés obra social?")

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = {}
            state = _extended_state(extended_attempts=0)
            result = generation_node(state)

        assert result.get("messages")
        assert result.get("extended_attempts") == 1

    def test_second_turn_with_valid_response_finalizes(self):
        """extended_attempts=1 + valid response → finalize and book."""
        state = _extended_state(
            extended_attempts=1,
            messages=[
                HumanMessage(content="Tengo OSEP, afiliado 777888, me duele la rodilla"),
            ],
        )

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Turno confirmado para Ana García.")

        mock_patient = MagicMock()
        mock_patient.patient_id = "patient-uuid-001"

        extracted_data = {
            "patient_obra_social": "OSEP",
            "patient_obra_social_number": "777888",
            "patient_motivo": "rodilla",
        }

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation._extract_extended_data", return_value=extracted_data),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        ):
            mock_draft.get_draft.return_value = {}
            mock_ts.get_tenant_config.return_value = MagicMock(
                calendar_id="cal@example.com",
                calendar_credentials={},
                calendar_credentials_ref=None,
            )
            mock_ts.get_tenant_services.return_value = []
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = "event-id-001"

            result = generation_node(state)

        mock_ps.get_or_create_patient.assert_called_once()
        call_kwargs = mock_ps.get_or_create_patient.call_args[1]
        assert call_kwargs["obra_social"] == "OSEP"
        assert call_kwargs["obra_social_number"] == "777888"
        assert call_kwargs["reason_for_visit"] == "rodilla"
        assert result.get("calendar_event_id") == "event-id-001"

    def test_particular_skips_obra_social_number(self):
        """When obra_social='particular', obra_social_number should not be set."""
        state = _extended_state(
            extended_attempts=1,
            messages=[HumanMessage(content="Soy particular, me duele el hombro")],
        )

        extracted_data = {
            "patient_obra_social": "particular",
            "patient_motivo": "hombro",
        }

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Perfecto, turno confirmado.")

        mock_patient = MagicMock()
        mock_patient.patient_id = "patient-uuid-002"

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation._extract_extended_data", return_value=extracted_data),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        ):
            mock_draft.get_draft.return_value = {}
            mock_ts.get_tenant_config.return_value = MagicMock(
                calendar_id="cal@example.com",
                calendar_credentials={},
                calendar_credentials_ref=None,
            )
            mock_ts.get_tenant_services.return_value = []
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = "event-id-002"

            result = generation_node(state)

        call_kwargs = mock_ps.get_or_create_patient.call_args[1]
        assert call_kwargs["obra_social"] == "particular"
        assert call_kwargs.get("obra_social_number") is None

    def test_second_turn_extraction_fails_retries(self):
        """extended_attempts=1 + empty extraction (not >= 2 yet) → retry, not finalize."""
        state = _extended_state(
            extended_attempts=1,
            messages=[HumanMessage(content="no entiendo qué me preguntás")],
        )

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Te repito la pregunta...")

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation._extract_extended_data", return_value={}),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
        ):
            mock_draft.get_draft.return_value = {}
            result = generation_node(state)

        mock_ps.get_or_create_patient.assert_not_called()
        assert result.get("extended_attempts") == 2

    def test_third_turn_extraction_fails_finalizes_anyway(self):
        """extended_attempts=2 → finalize even with empty extraction (no bloquea turno)."""
        state = _extended_state(
            extended_attempts=2,
            messages=[HumanMessage(content="no sé nada de eso")],
        )

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Igual confirmamos tu turno.")

        mock_patient = MagicMock()
        mock_patient.patient_id = "patient-uuid-003"

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation._extract_extended_data", return_value={}),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        ):
            mock_draft.get_draft.return_value = {}
            mock_ts.get_tenant_config.return_value = MagicMock(
                calendar_id="cal@example.com",
                calendar_credentials={},
                calendar_credentials_ref=None,
            )
            mock_ts.get_tenant_services.return_value = []
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = "event-id-003"

            result = generation_node(state)

        mock_ps.get_or_create_patient.assert_called_once()
        assert result.get("calendar_event_id") == "event-id-003"

    def test_all_fields_bulk_captured_in_one_turn(self):
        """Happy path: all 5 fields captured at once in extended_attempts=1."""
        state = _extended_state(
            extended_attempts=1,
            messages=[
                HumanMessage(
                    content="OSEP afiliado 123, me duele la espalda, tel 2615009988, Av. San Martín 400"
                )
            ],
        )

        all_fields = {
            "patient_obra_social": "OSEP",
            "patient_obra_social_number": "123",
            "patient_motivo": "espalda",
            "patient_alt_phone": "2615009988",
            "patient_address": "Av. San Martín 400",
        }

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Perfecto, todo registrado.")

        mock_patient = MagicMock()
        mock_patient.patient_id = "patient-uuid-004"

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch("app.agent.nodes.generation._extract_extended_data", return_value=all_fields),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        ):
            mock_draft.get_draft.return_value = {}
            mock_ts.get_tenant_config.return_value = MagicMock(
                calendar_id="cal@example.com",
                calendar_credentials={},
                calendar_credentials_ref=None,
            )
            mock_ts.get_tenant_services.return_value = []
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = "event-id-004"

            result = generation_node(state)

        call_kwargs = mock_ps.get_or_create_patient.call_args[1]
        assert call_kwargs["obra_social"] == "OSEP"
        assert call_kwargs["obra_social_number"] == "123"
        assert call_kwargs["reason_for_visit"] == "espalda"
        assert call_kwargs["alternative_phone"] == "2615009988"
        assert call_kwargs["address"] == "Av. San Martín 400"

    def test_draft_deleted_on_finalization(self):
        """booking_draft_service.delete_draft must be called after successful finalize."""
        state = _extended_state(
            extended_attempts=1,
            messages=[HumanMessage(content="Swiss Medical 99887")],
        )

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Turno confirmado.")

        mock_patient = MagicMock()
        mock_patient.patient_id = "patient-uuid-005"

        with (
            patch("app.agent.nodes.generation._get_llm", return_value=mock_llm),
            patch(
                "app.agent.nodes.generation._extract_extended_data",
                return_value={"patient_obra_social": "Swiss Medical"},
            ),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
            patch("app.agent.nodes.generation.patient_service") as mock_ps,
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
            patch("app.agent.nodes.generation.tenant_service") as mock_ts,
        ):
            mock_draft.get_draft.return_value = {}
            mock_ts.get_tenant_config.return_value = MagicMock(
                calendar_id="cal@example.com",
                calendar_credentials={},
                calendar_credentials_ref=None,
            )
            mock_ts.get_tenant_services.return_value = []
            mock_ps.get_or_create_patient.return_value = mock_patient
            mock_cs.create_event.return_value = "event-id-005"

            generation_node(state)

        mock_draft.delete_draft.assert_called_once_with(_TENANT, _PHONE)

"""Tests para Turn 2 del flujo de agendamiento.

Turn 2: paciente elige un slot diciendo "el 2" → el agente pide el nombre.

Flujo de nodos:
    triage → anti_diagnostic → booking → scheduling → rag_retrieval → generation

Criterios por nodo:
    - triage:          empathy_mode="normal"
    - anti_diagnostic: is_medical_query=False
    - booking:         detecta keyword → booking_intent=True, booking_action="confirm",
                       name_collection_active=True, guarda draft Redis, NO llama create_event
    - scheduling:      scheduling_intent=False (sin keywords de agendamiento)
    - generation:      gate activo (name_collection_active=True, sin patient_name)
                       → _handle_registration() Fase A, name_attempts=0
                       → usa _llm.invoke() (NO bind_tools)
                       → SystemMessage con "SOLICITAR NOMBRE" y display del slot
                       → retorna name_attempts=1
                       → llama booking_draft_service.update_draft
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

_TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_PHONE = "+5491155550001"
_CALENDAR_ID = "primary@group.calendar.google.com"

_FAKE_SLOTS = [
    {
        "start": "2026-04-10T09:00:00-03:00",
        "end": "2026-04-10T10:00:00-03:00",
        "display": "Viernes 10 de Abril — 09:00 a 10:00 hs",
    },
    {
        "start": "2026-04-10T10:00:00-03:00",
        "end": "2026-04-10T11:00:00-03:00",
        "display": "Viernes 10 de Abril — 10:00 a 11:00 hs",
    },
    {
        "start": "2026-04-10T11:00:00-03:00",
        "end": "2026-04-10T12:00:00-03:00",
        "display": "Viernes 10 de Abril — 11:00 a 12:00 hs",
    },
]


def _base_state(**kwargs) -> dict:
    """State base para Turn 2: ya vienen los slots cacheados del Turn 1."""
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="el 2")],
        "confidence_score": 1.0,
        "is_paused": False,
        "available_slots": _FAKE_SLOTS,
    }
    state.update(kwargs)
    return state


def _mock_tenant(calendar_id=_CALENDAR_ID, credentials=None, shadow_mode=False):
    t = MagicMock()
    t.calendar_id = calendar_id
    t.calendar_credentials = credentials or {"type": "service_account"}
    t.shadow_mode_enabled = shadow_mode
    return t


def _make_mock_llm(response_text: str = "¿Me das tu nombre completo para anotarte?") -> MagicMock:
    mock = MagicMock()
    ai_msg = AIMessage(content=response_text)
    mock.invoke.return_value = ai_msg
    mock.bind_tools.return_value.invoke.return_value = ai_msg
    return mock


# ─────────────────────────────────────────────────────────────────────────────
# NODE 1 — triage_node (Turn 2)
# ─────────────────────────────────────────────────────────────────────────────


class TestTriageTurn2:
    """triage_node no debe activar urgencia en mensajes de elección de turno."""

    def test_el_2_returns_normal(self):
        """Mensaje canónico de Turn 2 → empathy_mode='normal'."""
        from app.agent.nodes.triage import triage_node

        result = triage_node(_base_state())
        assert result == {"empathy_mode": "normal"}

    def test_variantes_eleccion_slot_son_normal(self):
        """Variantes de elección de slot no activan urgencia."""
        from app.agent.nodes.triage import triage_node

        mensajes = ["el 1", "el 3", "el primero", "el segundo", "el tercero", "dale", "listo"]
        for texto in mensajes:
            state = _base_state(messages=[HumanMessage(content=texto)])
            result = triage_node(state)
            assert result["empathy_mode"] == "normal", (
                f"Falso positivo de urgencia para: '{texto}'"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 2 — anti_diagnostic_node (Turn 2)
# ─────────────────────────────────────────────────────────────────────────────


class TestAntiDiagnosticTurn2:
    """anti_diagnostic_node no debe activar guardrail médico en mensajes de elección de slot."""

    def test_el_2_is_not_medical(self):
        """Mensaje canónico de Turn 2 → is_medical_query=False."""
        from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

        result = anti_diagnostic_node(_base_state())
        assert result == {"is_medical_query": False}

    def test_variantes_eleccion_no_son_medicas(self):
        """Variantes de elección de slot no activan el guardrail médico."""
        from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

        mensajes = ["el 1", "el 2", "el 3", "dale", "listo", "el segundo"]
        for texto in mensajes:
            state = _base_state(messages=[HumanMessage(content=texto)])
            result = anti_diagnostic_node(state)
            assert result == {"is_medical_query": False}, (
                f"Falso positivo médico para: '{texto}'"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 3 — booking_node (Turn 2 — deferral de registro)
# ─────────────────────────────────────────────────────────────────────────────


class TestBookingNodeTurn2Deferral:
    """
    booking_node en Turn 2: detecta keyword numérica, resuelve slot del state cacheado,
    verifica que el paciente no existe en DB, y difiere guardando draft en Redis.
    """

    def test_el_2_activates_booking_intent_and_name_collection(self):
        """'el 2' → booking_intent=True, booking_action='confirm', name_collection_active=True."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state())

        assert result["booking_intent"] is True
        assert result["booking_action"] == "confirm"
        assert result["name_collection_active"] is True

    def test_el_2_resolves_correct_slot_from_state_cache(self):
        """'el 2' → idx=1 → booked_slot es el segundo slot del state cacheado."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state())

        assert result.get("booked_slot") == _FAKE_SLOTS[1]
        assert result.get("selected_slot_index") == 1

    def test_uses_state_cached_slots_no_calendar_api_call(self):
        """Con available_slots en state, NO re-consulta calendar_service.get_available_slots."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_cs.get_available_slots.assert_not_called()

    def test_create_event_not_called_in_turn2(self):
        """calendar_service.create_event NO es llamado en Turn 2 (deferral, sin nombre aún)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_cs.create_event.assert_not_called()

    def test_calendar_event_id_is_none_in_deferral(self):
        """Deferral retorna calendar_event_id=None (el evento no fue creado aún)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state())

        assert result.get("calendar_event_id") is None

    def test_deferral_saves_draft_in_redis(self):
        """Paciente desconocido → save_draft es llamado con los campos correctos del deferral."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_draft.save_draft.assert_called_once()
        call_args = mock_draft.save_draft.call_args
        tenant_arg, phone_arg, draft_data = call_args[0]
        assert tenant_arg == _TENANT_ID
        assert phone_arg == _PHONE
        assert draft_data["name_collection_active"] is True
        assert draft_data["booked_slot"] == _FAKE_SLOTS[1]
        assert draft_data["selected_slot_index"] == 1
        assert draft_data["name_attempts"] == 0
        assert "slot_presented_at" in draft_data

    def test_deferral_slot_presented_at_is_set(self):
        """Deferral incluye slot_presented_at en el state retornado."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state())

        assert result.get("slot_presented_at") is not None

    def test_checks_patient_db_before_deferral(self):
        """booking_node consulta patient_service.get_patient_by_phone antes de diferir."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_ps.get_patient_by_phone.assert_called_once_with(_TENANT_ID, _PHONE)


class TestBookingNodeTurn2Keywords:
    """Verifica que múltiples keywords numéricas y coloquiales activan correctamente el deferral."""

    def _run_with_keyword(self, keyword: str) -> dict:
        """Helper: ejecuta booking_node con un keyword de confirm y paciente desconocido."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            state = _base_state(messages=[HumanMessage(content=keyword)])
            return booking_node(state)

    def test_el_1_activates_deferral(self):
        """'el 1' → name_collection_active=True (selecciona primer slot)."""
        result = self._run_with_keyword("el 1")
        assert result["booking_intent"] is True
        assert result["name_collection_active"] is True
        assert result.get("booked_slot") == _FAKE_SLOTS[0]
        assert result.get("selected_slot_index") == 0

    def test_el_3_activates_deferral(self):
        """'el 3' → name_collection_active=True (selecciona tercer slot)."""
        result = self._run_with_keyword("el 3")
        assert result["booking_intent"] is True
        assert result["name_collection_active"] is True
        assert result.get("booked_slot") == _FAKE_SLOTS[2]
        assert result.get("selected_slot_index") == 2

    def test_el_primero_activates_deferral(self):
        """'el primero' → name_collection_active=True."""
        result = self._run_with_keyword("el primero")
        assert result["booking_intent"] is True
        assert result["name_collection_active"] is True
        assert result.get("selected_slot_index") == 0

    def test_el_segundo_activates_deferral(self):
        """'el segundo' → name_collection_active=True."""
        result = self._run_with_keyword("el segundo")
        assert result["booking_intent"] is True
        assert result["name_collection_active"] is True
        assert result.get("selected_slot_index") == 1

    def test_dale_activates_deferral_with_ambiguous_slot(self):
        """'dale' sin número → booking_ambiguous_slot=True (sin booked_slot en state ni draft)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            # Sin available_slots previos en state → dale no puede resolver índice
            state = _base_state(
                messages=[HumanMessage(content="dale")],
                available_slots=_FAKE_SLOTS,
            )
            result = booking_node(state)

        # 'dale' no tiene índice numérico, y no hay booked_slot ni draft → ambiguous
        assert result["booking_intent"] is True
        assert result["booking_action"] == "confirm"
        assert result.get("booking_ambiguous_slot") is True

    def test_listo_activates_deferral_with_ambiguous_slot(self):
        """'listo' sin número → booking_ambiguous_slot=True (sin contexto de slot previo)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.patient_service") as mock_ps,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ps.get_patient_by_phone.return_value = None
            mock_draft.get_draft.return_value = None

            state = _base_state(
                messages=[HumanMessage(content="listo")],
                available_slots=_FAKE_SLOTS,
            )
            result = booking_node(state)

        assert result["booking_intent"] is True
        assert result.get("booking_ambiguous_slot") is True

    def test_si_ok_sin_numero_ambiguous_slot(self):
        """'sí' y 'ok' sin número de slot → booking_ambiguous_slot=True (no adivina el slot)."""
        from app.agent.nodes.booking import booking_node

        for keyword in ("sí", "ok", "perfecto"):
            with (
                patch("app.agent.nodes.booking.tenant_service") as mock_ts,
                patch("app.agent.nodes.booking.calendar_service"),
                patch("app.agent.nodes.booking.patient_service") as mock_ps,
                patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
            ):
                mock_ts.get_tenant_config.return_value = _mock_tenant()
                mock_ps.get_patient_by_phone.return_value = None
                mock_draft.get_draft.return_value = None

                state = _base_state(
                    messages=[HumanMessage(content=keyword)],
                    available_slots=_FAKE_SLOTS,
                )
                result = booking_node(state)

            assert result.get("booking_ambiguous_slot") is True, (
                f"'{keyword}' sin número debería ser ambiguous_slot"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 4 — scheduling_node (Turn 2 — no-op)
# ─────────────────────────────────────────────────────────────────────────────


class TestSchedulingNodeTurn2:
    """scheduling_node en Turn 2: 'el 2' no tiene keywords de agendamiento → no-op."""

    def test_el_2_no_scheduling_intent(self):
        """'el 2' → scheduling_intent=False, sin llamada a Calendar."""
        from app.agent.nodes.scheduling import scheduling_node

        with (
            patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
            patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        ):
            result = scheduling_node(_base_state())

        assert result.get("scheduling_intent") is False
        mock_cs.get_available_slots.assert_not_called()

    def test_keywords_confirm_no_scheduling_intent(self):
        """Keywords de confirmación de Turn 2 no activan scheduling_intent."""
        from app.agent.nodes.scheduling import scheduling_node

        keywords_no_scheduling = ["el 1", "el 2", "el 3", "dale", "listo", "el segundo"]
        for keyword in keywords_no_scheduling:
            with (
                patch("app.agent.nodes.scheduling.tenant_service"),
                patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
            ):
                state = _base_state(messages=[HumanMessage(content=keyword)])
                result = scheduling_node(state)

            assert result.get("scheduling_intent") is False, (
                f"'{keyword}' activó scheduling_intent incorrectamente"
            )
            mock_cs.get_available_slots.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# NODE 6 — generation_node (Turn 2 — Fase A: pedir nombre)
# ─────────────────────────────────────────────────────────────────────────────


class TestGenerationNodeTurn2PhaseA:
    """generation_node en Turn 2: gate activo → _handle_registration Fase A (name_attempts=0)."""

    def _turn2_state(self, **kwargs) -> dict:
        """State para generation_node en Turn 2: name_collection_active=True, sin patient_name."""
        state = {
            "tenant_id": _TENANT_ID,
            "phone_number": _PHONE,
            "messages": [HumanMessage(content="el 2")],
            "confidence_score": 1.0,
            "is_paused": False,
            "booking_intent": True,
            "booking_action": "confirm",
            "name_collection_active": True,
            "booked_slot": _FAKE_SLOTS[1],
            "selected_slot_index": 1,
            "name_attempts": 0,
            "calendar_event_id": None,
        }
        state.update(kwargs)
        return state

    def test_registration_gate_activates_with_name_collection_active(self):
        """Gate activo (name_collection_active=True, sin patient_name) → entra a _handle_registration."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            result = generation_node(state)

        # El resultado debe contener un AIMessage (la pregunta por el nombre)
        assert "messages" in result
        assert len(result["messages"]) == 1
        assert isinstance(result["messages"][0], AIMessage)

    def test_uses_invoke_not_bind_tools(self):
        """Fase A usa _llm.invoke() directamente, NO bind_tools."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        mock_llm.invoke.assert_called_once()
        mock_llm.bind_tools.assert_not_called()

    def test_system_message_contains_solicitar_nombre(self):
        """El SystemMessage contiene 'SOLICITAR NOMBRE DEL PACIENTE' (instrucción al LLM)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert isinstance(system_msg, SystemMessage)
        assert "SOLICITAR NOMBRE" in system_msg.content

    def test_system_message_contains_slot_display(self):
        """El SystemMessage contiene el display del slot elegido."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()
        expected_display = _FAKE_SLOTS[1]["display"]

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert expected_display in system_msg.content, (
            f"Display del slot ausente en SystemMessage: '{expected_display}'"
        )

    def test_returns_name_attempts_incremented_to_1(self):
        """Fase A (name_attempts=0) retorna name_attempts=1."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(state)

        assert result.get("name_attempts") == 1

    def test_calls_update_draft_with_incremented_name_attempts(self):
        """Fase A llama booking_draft_service.update_draft con name_attempts=1."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service") as mock_draft,
        ):
            generation_node(state)

        mock_draft.update_draft.assert_called_once_with(
            _TENANT_ID, _PHONE, {"name_attempts": 1}
        )

    def test_system_message_is_first_element_in_llm_call(self):
        """El SystemMessage es el primer elemento de la lista pasada a _llm.invoke()."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state()

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        messages_to_llm = mock_llm.invoke.call_args[0][0]
        assert isinstance(messages_to_llm[0], SystemMessage)
        assert isinstance(messages_to_llm[1], HumanMessage)

    def test_gate_does_not_activate_without_name_collection_active(self):
        """Sin name_collection_active, el gate NO activa registration (toma otro path)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        # booking_intent=True pero sin name_collection_active → path de booking normal
        state = self._turn2_state(name_collection_active=False)

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        # En booking path, usa invoke (no bind_tools) — pero el SystemMessage NO tiene SOLICITAR NOMBRE
        if mock_llm.invoke.called:
            system_msg = mock_llm.invoke.call_args[0][0][0]
            assert "SOLICITAR NOMBRE" not in system_msg.content

    def test_gate_does_not_activate_when_patient_name_already_set(self):
        """Con patient_name ya seteado, el gate NO activa registration."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state(patient_name="Juan Pérez", name_collection_active=True)

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        # Debe invocar al LLM, pero NO debe llamar update_draft con name_attempts
        # (la Fase A de nombre no se ejecuta si ya tenemos patient_name)
        if mock_llm.invoke.called:
            system_msg = mock_llm.invoke.call_args[0][0][0]
            assert "SOLICITAR NOMBRE DEL PACIENTE" not in system_msg.content

    def test_slot_display_from_first_slot_when_el_1(self):
        """Con booked_slot del primer slot, el display del primer slot aparece en SystemMessage."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state(
            messages=[HumanMessage(content="el 1")],
            booked_slot=_FAKE_SLOTS[0],
            selected_slot_index=0,
        )
        expected_display = _FAKE_SLOTS[0]["display"]

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert expected_display in system_msg.content

    def test_slot_display_from_third_slot_when_el_3(self):
        """Con booked_slot del tercer slot, el display del tercer slot aparece en SystemMessage."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = self._turn2_state(
            messages=[HumanMessage(content="el 3")],
            booked_slot=_FAKE_SLOTS[2],
            selected_slot_index=2,
        )
        expected_display = _FAKE_SLOTS[2]["display"]

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert expected_display in system_msg.content


class TestGenerationNodeTurn2GatePriority:
    """Verifica que el gate de registro tiene prioridad correcta sobre otros paths."""

    def test_registration_gate_takes_priority_over_booking_path(self):
        """name_collection_active=True toma prioridad sobre el booking path normal."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        # State con ambos: name_collection_active=True Y booking_intent=True
        state = {
            "tenant_id": _TENANT_ID,
            "phone_number": _PHONE,
            "messages": [HumanMessage(content="el 2")],
            "booking_intent": True,
            "booking_action": "confirm",
            "name_collection_active": True,
            "booked_slot": _FAKE_SLOTS[1],
            "name_attempts": 0,
            "calendar_event_id": None,
            "is_paused": False,
        }

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(state)

        # Debe entrar al gate de registro, no al booking path
        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert "SOLICITAR NOMBRE" in system_msg.content

    def test_shadow_mode_takes_priority_over_registration_gate(self):
        """shadow_mode_active=True tiene prioridad sobre el gate de registration."""
        from app.agent.nodes.generation import SHADOW_MODE_REDIRECT_RESPONSE, generation_node

        mock_llm = _make_mock_llm()
        state = {
            "tenant_id": _TENANT_ID,
            "phone_number": _PHONE,
            "messages": [HumanMessage(content="el 2")],
            "shadow_mode_active": True,
            "name_collection_active": True,
            "booked_slot": _FAKE_SLOTS[1],
            "name_attempts": 0,
            "is_paused": False,
        }

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.booking_draft_service"),
        ):
            result = generation_node(state)

        mock_llm.invoke.assert_not_called()
        assert result["messages"][0].content == SHADOW_MODE_REDIRECT_RESPONSE

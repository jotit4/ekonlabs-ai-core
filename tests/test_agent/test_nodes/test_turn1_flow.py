"""Tests para Turn 1 del flujo de agendamiento.

Turn 1: paciente envía su primer mensaje con intención de sacar un turno.
Ejemplo: "quiero sacar un turno"

Flujo de nodos:
    triage → anti_diagnostic → booking → scheduling → rag_retrieval → generation

Criterios de aceptación por nodo:
    - triage:          empathy_mode="normal" (sin keywords de dolor/urgencia)
    - anti_diagnostic: is_medical_query=False
    - booking:         booking_intent=False (sin keywords confirm/cancel),
                       NO llama a DB ni Calendar, SÍ verifica Redis draft
    - scheduling:      scheduling_intent=True, available_slots=[...3 slots]
    - rag_retrieval:   {} (no-op, ya cubierto en test_rag_retrieval.py)
    - generation:      usa _llm.invoke() (no bind_tools), inyecta displays + emojis en contexto
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

_TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_PHONE = "+5491155550001"
_CALENDAR_ID = "primary@group.calendar.google.com"
_SERVICE_A_ID = "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_SERVICE_B_ID = "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
_CAL_A = "service-a@group.calendar.google.com"
_CAL_B = "service-b@group.calendar.google.com"

_FAKE_SLOTS = [
    {"start": "2026-04-10T09:00:00-03:00", "end": "2026-04-10T10:00:00-03:00", "display": "Viernes 10 de Abril — 09:00 a 10:00 hs"},
    {"start": "2026-04-10T10:00:00-03:00", "end": "2026-04-10T11:00:00-03:00", "display": "Viernes 10 de Abril — 10:00 a 11:00 hs"},
    {"start": "2026-04-10T11:00:00-03:00", "end": "2026-04-10T12:00:00-03:00", "display": "Viernes 10 de Abril — 11:00 a 12:00 hs"},
]


def _base_state(**kwargs) -> dict:
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content="quiero sacar un turno")],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def _mock_tenant(calendar_id=_CALENDAR_ID, credentials=None, shadow_mode=False):
    t = MagicMock()
    t.calendar_id = calendar_id
    t.calendar_credentials = credentials or {"type": "service_account"}
    t.shadow_mode_enabled = shadow_mode
    t.uses_native_calendar = False
    return t


def _mock_service(service_id: str, name: str, calendar_id: str, duration: int = 60):
    svc = MagicMock()
    svc.service_id = service_id
    svc.name = name
    svc.calendar_id = calendar_id
    svc.duration_minutes = duration
    return svc


def _make_mock_llm(response_text: str = "Encontré estos turnos disponibles...") -> MagicMock:
    mock = MagicMock()
    ai_msg = AIMessage(content=response_text)
    mock.invoke.return_value = ai_msg
    mock.bind_tools.return_value.invoke.return_value = ai_msg
    return mock


# ─────────────────────────────────────────────────────────────────────────────
# NODE 1 — triage_node
# ─────────────────────────────────────────────────────────────────────────────

class TestTriageTurn1:
    """triage_node no debe activar urgencia en mensajes de agendamiento estándar."""

    def test_quiero_sacar_un_turno_returns_normal(self):
        """Mensaje canónico de Turn 1 → empathy_mode='normal'."""
        from app.agent.nodes.triage import triage_node

        result = triage_node(_base_state())
        assert result == {"empathy_mode": "normal"}

    def test_variantes_comunes_turn1_son_normal(self):
        """Variantes naturales de intención de turno no activan urgencia."""
        from app.agent.nodes.triage import triage_node

        mensajes = [
            "hola, quisiera sacar un turno",
            "buen día, necesito agendar una cita",
            "quiero reservar un turno para esta semana",
            "hay disponibilidad esta semana?",
            "cuándo tienen turnos?",
        ]
        for texto in mensajes:
            state = _base_state(messages=[HumanMessage(content=texto)])
            result = triage_node(state)
            assert result["empathy_mode"] == "normal", (
                f"Falso positivo de urgencia para: '{texto}'"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 2 — anti_diagnostic_node
# ─────────────────────────────────────────────────────────────────────────────

class TestAntiDiagnosticTurn1:
    """anti_diagnostic_node no debe activar guardrail médico en mensajes de agendamiento."""

    def test_quiero_sacar_un_turno_is_not_medical(self):
        """Mensaje canónico de Turn 1 → is_medical_query=False."""
        from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

        result = anti_diagnostic_node(_base_state())
        assert result == {"is_medical_query": False}

    def test_variantes_comunes_turn1_no_son_medicas(self):
        """Variantes de agendamiento no activan el guardrail médico."""
        from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

        mensajes = [
            "hola, quisiera sacar un turno",
            "necesito agendar una consulta",
            "quiero reservar una cita",
            "hay turnos para mañana?",
            "cuándo tienen disponibilidad?",
        ]
        for texto in mensajes:
            state = _base_state(messages=[HumanMessage(content=texto)])
            result = anti_diagnostic_node(state)
            assert result == {"is_medical_query": False}, (
                f"Falso positivo médico para: '{texto}'"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 3 — booking_node (Turn 1 pass-through)
# ─────────────────────────────────────────────────────────────────────────────

class TestBookingNodeTurn1:
    """En Turn 1 el booking_node debe pasar sin acción: no es confirm ni cancel."""

    def test_no_intent_returns_booking_intent_false(self):
        """'quiero sacar un turno' no contiene keywords → booking_intent=False."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None

            result = booking_node(_base_state())

        assert result == {"booking_intent": False}

    def test_no_intent_does_not_call_tenant_service(self):
        """Sin intent → tenant_service.get_tenant_config NO debe llamarse (sin DB call)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service") as mock_ts,
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_ts.get_tenant_config.assert_not_called()

    def test_no_intent_does_not_call_calendar_service(self):
        """Sin intent → calendar_service NO debe llamarse (sin API call a Google)."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service") as mock_cs,
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_cs.get_available_slots.assert_not_called()
        mock_cs.create_event.assert_not_called()

    def test_no_intent_checks_redis_draft(self):
        """INFRA-06: aunque no haya intent, el nodo SÍ consulta Redis para re-hidratación."""
        from app.agent.nodes.booking import booking_node

        with (
            patch("app.agent.nodes.booking.tenant_service"),
            patch("app.agent.nodes.booking.calendar_service"),
            patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
        ):
            mock_draft.get_draft.return_value = None

            booking_node(_base_state())

        mock_draft.get_draft.assert_called_once_with(_TENANT_ID, _PHONE)

    def test_variantes_comunes_turn1_retornan_false(self):
        """Variantes de primer mensaje de agendamiento no activan booking_intent."""
        from app.agent.nodes.booking import booking_node

        mensajes = [
            "hola, quisiera sacar un turno",
            "necesito agendar una consulta",
            "quiero reservar una cita para esta semana",
            "hay disponibilidad?",
            "buenos días, cuándo tienen turnos?",
        ]
        for texto in mensajes:
            with (
                patch("app.agent.nodes.booking.tenant_service"),
                patch("app.agent.nodes.booking.calendar_service"),
                patch("app.agent.nodes.booking.booking_draft_service") as mock_draft,
            ):
                mock_draft.get_draft.return_value = None
                result = booking_node(_base_state(messages=[HumanMessage(content=texto)]))

            assert result == {"booking_intent": False}, (
                f"booking_intent activado incorrectamente para: '{texto}'"
            )


# ─────────────────────────────────────────────────────────────────────────────
# NODE 4 — scheduling_node (Turn 1) — multi-servicio v1.3
# (el path single-tenant ya está cubierto en test_scheduling.py)
# ─────────────────────────────────────────────────────────────────────────────

class TestSchedulingNodeTurn1MultiService:
    """Escenarios multi-servicio (v1.3) en Turn 1."""

    def test_single_service_tenant_autoselects(self):
        """Tenant con un solo servicio → se selecciona automáticamente, usa calendar del servicio."""
        from app.agent.nodes.scheduling import scheduling_node

        svc = _mock_service(_SERVICE_A_ID, "Kinesiología", _CAL_A, 45)

        with (
            patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
            patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = [svc]
            mock_cs.get_available_slots.return_value = _FAKE_SLOTS

            result = scheduling_node(_base_state())

        assert result["scheduling_intent"] is True
        assert result["selected_service_id"] == _SERVICE_A_ID
        assert result["selected_service_name"] == "Kinesiología"
        # calendar_id del servicio, no del tenant
        mock_cs.get_available_slots.assert_called_once()
        call_kwargs = mock_cs.get_available_slots.call_args[1]
        assert call_kwargs["calendar_id"] == _CAL_A
        assert call_kwargs["duration_minutes"] == 45

    def test_multi_service_no_service_detected_returns_pending(self):
        """Tenant con múltiples servicios y mensaje sin nombre de servicio → service_selection_pending=True."""
        from app.agent.nodes.scheduling import scheduling_node

        svc_a = _mock_service(_SERVICE_A_ID, "Kinesiología", _CAL_A)
        svc_b = _mock_service(_SERVICE_B_ID, "Fisioterapia", _CAL_B)

        with (
            patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
            patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = [svc_a, svc_b]

            # Mensaje genérico sin nombre de servicio
            result = scheduling_node(_base_state(messages=[HumanMessage(content="quiero sacar un turno")]))

        assert result["scheduling_intent"] is True
        assert result.get("service_selection_pending") is True
        assert result.get("available_slots") == []
        # No debe consultar el calendario sin saber el servicio
        mock_cs.get_available_slots.assert_not_called()

    def test_multi_service_service_detected_uses_service_calendar(self):
        """Tenant con múltiples servicios, paciente menciona el servicio → usa calendar del servicio detectado."""
        from app.agent.nodes.scheduling import scheduling_node

        svc_a = _mock_service(_SERVICE_A_ID, "Kinesiología", _CAL_A)
        svc_b = _mock_service(_SERVICE_B_ID, "Fisioterapia", _CAL_B)

        with (
            patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
            patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = [svc_a, svc_b]
            mock_cs.get_available_slots.return_value = _FAKE_SLOTS

            result = scheduling_node(_base_state(
                messages=[HumanMessage(content="quiero turno de kinesiología")]
            ))

        assert result["scheduling_intent"] is True
        assert result["selected_service_id"] == _SERVICE_A_ID
        assert result["selected_service_name"] == "Kinesiología"
        call_kwargs = mock_cs.get_available_slots.call_args[1]
        assert call_kwargs["calendar_id"] == _CAL_A

    def test_multi_service_service_already_in_state_skips_detection(self):
        """Si selected_service_id ya está en state, no re-detecta del mensaje."""
        from app.agent.nodes.scheduling import scheduling_node

        svc_a = _mock_service(_SERVICE_A_ID, "Kinesiología", _CAL_A)
        svc_b = _mock_service(_SERVICE_B_ID, "Fisioterapia", _CAL_B)

        with (
            patch("app.agent.nodes.scheduling.tenant_service") as mock_ts,
            patch("app.agent.nodes.scheduling.calendar_service") as mock_cs,
        ):
            mock_ts.get_tenant_config.return_value = _mock_tenant()
            mock_ts.get_tenant_services.return_value = [svc_a, svc_b]
            mock_cs.get_available_slots.return_value = _FAKE_SLOTS

            # El mensaje no menciona el servicio, pero ya está en state
            result = scheduling_node(_base_state(
                messages=[HumanMessage(content="quiero un turno para esta semana")],
                selected_service_id=_SERVICE_B_ID,
            ))

        assert result["scheduling_intent"] is True
        assert result["selected_service_id"] == _SERVICE_B_ID
        assert result["selected_service_name"] == "Fisioterapia"
        call_kwargs = mock_cs.get_available_slots.call_args[1]
        assert call_kwargs["calendar_id"] == _CAL_B


# ─────────────────────────────────────────────────────────────────────────────
# NODE 6 — generation_node (scheduling path, Turn 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerationNodeTurn1SchedulingPath:
    """generation_node en el path de scheduling (scheduling_intent=True)."""

    def test_scheduling_path_uses_invoke_not_bind_tools(self):
        """RESP-01: scheduling path llama a _llm.invoke() directamente, no a bind_tools."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=_FAKE_SLOTS)

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        mock_llm.invoke.assert_called_once()
        mock_llm.bind_tools.assert_not_called()

    def test_scheduling_path_injects_slot_displays(self):
        """RESP-01: los display strings de los slots están inyectados en el SystemMessage."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=_FAKE_SLOTS)

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert isinstance(system_msg, SystemMessage)
        for slot in _FAKE_SLOTS:
            assert slot["display"] in system_msg.content, (
                f"Display ausente en contexto: {slot['display']}"
            )

    def test_scheduling_path_injects_emoji_numbers(self):
        """RESP-01: los slots se presentan con emojis numéricos 1️⃣ 2️⃣ 3️⃣."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=_FAKE_SLOTS)

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert "1️⃣" in system_msg.content
        assert "2️⃣" in system_msg.content
        assert "3️⃣" in system_msg.content

    def test_scheduling_path_first_interaction_includes_greeting_hint(self):
        """Primera interacción del paciente → contexto incluye hint de saludo cálido."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        # Solo 1 HumanMessage → primera interacción
        state = _base_state(
            scheduling_intent=True,
            available_slots=_FAKE_SLOTS,
            messages=[HumanMessage(content="quiero sacar un turno")],
        )

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        # El greeting hint aparece solo para primeras interacciones
        assert "saludo" in system_msg.content.lower() or "primer" in system_msg.content.lower(), (
            "El greeting hint no está presente en la primera interacción"
        )

    def test_scheduling_path_subsequent_interaction_no_greeting_hint(self):
        """Interacción posterior (>2 mensajes humanos) → sin hint de saludo."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        # Historial con varios mensajes humanos → no es primera interacción
        state = _base_state(
            scheduling_intent=True,
            available_slots=_FAKE_SLOTS,
            messages=[
                HumanMessage(content="hola"),
                AIMessage(content="¡Hola! ¿En qué puedo ayudarte?"),
                HumanMessage(content="quiero un turno de kinesiología"),
                AIMessage(content="Aquí los turnos disponibles..."),
                HumanMessage(content="quiero sacar otro turno"),
            ],
        )

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        # El greeting hint no debe aparecer en interacciones posteriores
        assert "Si es el primer mensaje" not in system_msg.content

    def test_scheduling_path_no_slots_does_not_inject_displays(self):
        """RESP-04: sin slots → el contexto no contiene displays (no hay qué mostrar)."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=[])

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        # Sin slots, ningún display puede estar en el contexto
        for slot in _FAKE_SLOTS:
            assert slot["display"] not in system_msg.content

    def test_scheduling_path_no_slots_instructs_no_availability(self):
        """RESP-04: sin slots → contexto indica 'SIN TURNOS DISPONIBLES' al LLM."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=[])

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        system_msg = mock_llm.invoke.call_args[0][0][0]
        assert "SIN TURNOS" in system_msg.content or "no hay turnos" in system_msg.content.lower()

    def test_scheduling_path_returns_ai_message(self):
        """El resultado siempre es un dict con messages=[AIMessage]."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm("Encontré estos turnos disponibles para vos.")
        state = _base_state(scheduling_intent=True, available_slots=_FAKE_SLOTS)

        with patch("app.agent.nodes.generation._llm", mock_llm):
            result = generation_node(state)

        assert "messages" in result
        assert len(result["messages"]) == 1
        assert isinstance(result["messages"][0], AIMessage)

    def test_scheduling_path_system_message_is_first_in_llm_call(self):
        """El SystemMessage con el contexto siempre es el primer elemento del llamado al LLM."""
        from app.agent.nodes.generation import generation_node

        mock_llm = _make_mock_llm()
        state = _base_state(scheduling_intent=True, available_slots=_FAKE_SLOTS)

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(state)

        messages_to_llm = mock_llm.invoke.call_args[0][0]
        assert isinstance(messages_to_llm[0], SystemMessage)
        # El HumanMessage del estado viene después del SystemMessage
        assert isinstance(messages_to_llm[1], HumanMessage)

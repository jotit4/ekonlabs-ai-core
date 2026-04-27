"""Tests para booking_mode='cycle' — Pilates/Aquagym (F-ISADI-1)."""
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.scheduling import scheduling_node
from app.agent.nodes.generation import generation_node
from app.agent.graph import _route_after_scheduling

_TENANT = "tenant-isadi-uuid"
_PHONE = "+5491155443322"


def _make_cycle_service(name="Pilates"):
    svc = MagicMock()
    svc.service_id = "svc-pilates-uuid"
    svc.name = name
    svc.booking_mode = "cycle"
    svc.professional_name = "Prof. Rocío López"
    svc.capacity_per_slot = 4
    svc.reminder_instructions = "Ropa cómoda"
    svc.calendar_id = "pilates@group.calendar.google.com"
    svc.duration_minutes = 60
    svc.prerequisite_note = None
    return svc


def _base_state(message="quiero hacer pilates", **kwargs):
    return {
        "tenant_id": _TENANT,
        "phone_number": _PHONE,
        "messages": [HumanMessage(content=message)],
        **kwargs,
    }


def _scheduling_patches(svc, message="quiero turno de pilates"):
    """Devuelve context manager con todos los patches necesarios para scheduling_node."""
    mock_tenant = MagicMock()
    mock_tenant.shadow_mode_enabled = False
    mock_tenant.calendar_id = None
    mock_tenant.calendar_credentials = {}
    mock_tenant.calendar_credentials_ref = None

    from contextlib import ExitStack
    from unittest.mock import patch as _patch

    def ctx(extra_svc=None):
        stack = ExitStack()
        mock_ts = stack.enter_context(_patch("app.agent.nodes.scheduling.tenant_service"))
        mock_ts.get_tenant_config.return_value = mock_tenant
        mock_ts.get_tenant_services.return_value = [extra_svc or svc]
        stack.enter_context(_patch("app.agent.nodes.scheduling.detect_service", return_value=svc))
        stack.enter_context(_patch("app.agent.nodes.scheduling.has_scheduling_intent", return_value=True))
        stack.enter_context(_patch("app.agent.nodes.scheduling._llm_has_scheduling_intent", return_value=True))
        stack.enter_context(_patch("app.agent.nodes.scheduling.resolve_calendar_credentials", return_value={}))
        return stack

    return ctx


class TestSchedulingNodeCycle:
    def test_cycle_service_returns_cycle_active_flag(self):
        svc = _make_cycle_service()
        with _scheduling_patches(svc)():
            result = scheduling_node(_base_state("quiero turno de pilates"))

        assert result.get("cycle_service_active") is True
        assert result.get("cycle_service_name") == "Pilates"

    def test_cycle_sets_scheduling_intent_false(self):
        svc = _make_cycle_service()
        with _scheduling_patches(svc)():
            result = scheduling_node(_base_state("quiero turno de pilates"))

        assert result.get("scheduling_intent") is False

    def test_cycle_includes_professional_info(self):
        svc = _make_cycle_service()
        with _scheduling_patches(svc)():
            result = scheduling_node(_base_state("quiero turno de pilates"))

        cycle_info = result.get("cycle_service_info", "")
        assert "Rocío López" in cycle_info
        assert "4" in cycle_info  # capacity

    def test_aquagym_cycle_detected(self):
        aquagym = _make_cycle_service("Aquagym")
        aquagym.professional_name = "Profesora Martina"
        aquagym.capacity_per_slot = 9

        with _scheduling_patches(aquagym)():
            result = scheduling_node(_base_state("quiero turno de aquagym"))

        assert result.get("cycle_service_active") is True
        assert result.get("cycle_service_name") == "Aquagym"


class TestRouteAfterSchedulingCycle:
    def test_cycle_service_routes_to_generation(self):
        state = {
            "tenant_id": _TENANT,
            "phone_number": _PHONE,
            "messages": [],
            "cycle_service_active": True,
        }
        assert _route_after_scheduling(state) == "generation"

    def test_walk_in_routes_to_generation(self):
        state = {
            "tenant_id": _TENANT,
            "phone_number": _PHONE,
            "messages": [],
            "walk_in_service": True,
        }
        assert _route_after_scheduling(state) == "generation"

    def test_gated_routes_to_generation(self):
        state = {
            "tenant_id": _TENANT,
            "phone_number": _PHONE,
            "messages": [],
            "gated_service_active": True,
        }
        assert _route_after_scheduling(state) == "generation"

    def test_no_flags_routes_to_rag(self):
        state = {
            "tenant_id": _TENANT,
            "phone_number": _PHONE,
            "messages": [],
        }
        assert _route_after_scheduling(state) == "rag_retrieval"


class TestGenerationNodeCycle:
    def _cycle_state(self, service_name="Pilates"):
        return {
            "tenant_id": _TENANT,
            "phone_number": _PHONE,
            "messages": [HumanMessage(content="quiero hacer pilates")],
            "cycle_service_active": True,
            "cycle_service_name": service_name,
            "cycle_service_info": "Profesional: Prof. Rocío López | Capacidad por clase: 4 personas",
            "is_medical_query": False,
            "is_paused": False,
        }

    def test_cycle_calls_llm_not_hardcoded(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Pilates funciona por ciclo...")

        with patch("app.agent.nodes.generation._llm", mock_llm):
            result = generation_node(self._cycle_state())

        mock_llm.invoke.assert_called_once()
        messages = result["messages"]
        assert len(messages) == 1
        assert isinstance(messages[0], AIMessage)

    def test_cycle_context_injected_in_system_prompt(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Pilates funciona por ciclo...")

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(self._cycle_state())

        call_args = mock_llm.invoke.call_args[0][0]
        system_content = call_args[0].content
        assert "ciclo" in system_content.lower() or "cycle" in system_content.lower() or "CICLO" in system_content
        assert "Pilates" in system_content

    def test_cycle_does_not_try_to_book_calendar(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Pilates funciona por ciclo...")

        with (
            patch("app.agent.nodes.generation._llm", mock_llm),
            patch("app.agent.nodes.generation.calendar_service") as mock_cs,
        ):
            generation_node(self._cycle_state())

        mock_cs.create_event.assert_not_called()
        mock_cs.get_available_slots.assert_not_called()

    def test_cycle_takes_priority_over_rag_path(self):
        """cycle_service_active debe activarse ANTES del camino normal de RAG+LLM."""
        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = AIMessage(content="resp")
        mock_llm.invoke.return_value = AIMessage(content="Pilates es por ciclo")

        with patch("app.agent.nodes.generation._llm", mock_llm):
            generation_node(self._cycle_state())

        # bind_tools (RAG path) no debe ser llamado; solo invoke directo
        mock_llm.bind_tools.assert_not_called()
        mock_llm.invoke.assert_called_once()

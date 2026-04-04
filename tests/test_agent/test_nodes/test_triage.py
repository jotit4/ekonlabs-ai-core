"""Tests para app/agent/nodes/triage.py — triage_node (Story 2.4)."""
from langchain_core.messages import AIMessage, HumanMessage

from app.agent.nodes.triage import triage_node

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"


def _base_state(**kwargs):
    state = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": [],
        "confidence_score": 1.0,
        "is_paused": False,
    }
    state.update(kwargs)
    return state


def test_triage_node_returns_normal_by_default():
    """Sin mensajes humanos → empathy_mode='normal'."""
    from app.agent.nodes.triage import triage_node

    result = triage_node(_base_state(messages=[]))
    assert result == {"empathy_mode": "normal"}


def test_triage_node_detects_pain_keyword():
    """Mensaje con keyword de dolor → empathy_mode='urgent'."""
    from app.agent.nodes.triage import triage_node

    state = _base_state(messages=[HumanMessage(content="me duele mucho la cabeza")])
    result = triage_node(state)
    assert result == {"empathy_mode": "urgent"}


def test_triage_node_detects_urgency_keyword():
    """Mensaje con keyword de urgencia → empathy_mode='urgent'."""
    from app.agent.nodes.triage import triage_node

    state = _base_state(messages=[HumanMessage(content="es una emergencia, necesito ayuda")])
    result = triage_node(state)
    assert result == {"empathy_mode": "urgent"}


def test_triage_node_ignores_ai_messages():
    """Solo el último HumanMessage importa; AIMessages anteriores no activan urgencia."""
    from app.agent.nodes.triage import triage_node

    # El AIMessage contiene keyword pero el último HumanMessage no
    state = _base_state(messages=[
        HumanMessage(content="¿Cuáles son los horarios?"),
        AIMessage(content="Tenemos dolor de muelas tratados aquí"),
        HumanMessage(content="Perfecto, gracias"),
    ])
    result = triage_node(state)
    assert result == {"empathy_mode": "normal"}


def test_triage_node_is_failsafe_on_exception():
    """Si ocurre una excepción interna → empathy_mode='normal' (fail-safe)."""
    from app.agent.nodes.triage import triage_node

    # Objeto que lanza excepción al iterar — activa el bloque except
    class BrokenIterable:
        def __reversed__(self):
            raise RuntimeError("simulated internal error")

    bad_state = _base_state(messages=BrokenIterable())
    result = triage_node(bad_state)
    assert result == {"empathy_mode": "normal"}


def test_triage_node_keyword_case_insensitive():
    """Detección es case-insensitive (todo se compara en lowercase)."""
    from app.agent.nodes.triage import triage_node

    state = _base_state(messages=[HumanMessage(content="TENGO MUCHO DOLOR")])
    result = triage_node(state)
    assert result == {"empathy_mode": "urgent"}


# ============================================================
# Tests de falsos positivos (CLAUDE.md policy — agregado en code review 2026-03-25)
# ============================================================

class TestTriageNodeFalsePositives:
    """Verifica que mensajes de agendamiento rutinario NO activen modo urgencia."""

    def _make_state(self, text: str) -> dict:
        return {
            "tenant_id": "tenant-test",
            "phone_number": "+541100000000",
            "messages": [HumanMessage(content=text)],
        }

    def test_scheduling_query_does_not_trigger_urgency(self):
        """'quiero sacar turno' no debe activar urgencia."""
        state = self._make_state("quiero sacar un turno para la semana que viene")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_availability_query_does_not_trigger_urgency(self):
        """Consulta de disponibilidad no debe activar urgencia."""
        state = self._make_state("¿cuándo tienen disponibilidad para una consulta?")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_price_query_does_not_trigger_urgency(self):
        """Consulta de precios no debe activar urgencia."""
        state = self._make_state("¿cuánto cuesta la consulta con el traumatólogo?")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_reschedule_query_does_not_trigger_urgency(self):
        """Reprogramar turno no debe activar urgencia."""
        state = self._make_state("quiero cambiar mi turno del jueves a otro día")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_empty_message_does_not_crash(self):
        """Mensaje vacío no debe crashear el nodo (fail-safe)."""
        state = self._make_state("")
        result = triage_node(state)
        assert "empathy_mode" in result
        assert result["empathy_mode"] in ("normal", "urgent")

    def test_empty_message_followed_by_urgent_detects_urgency(self):
        """Si el último mensaje es vacío pero el anterior tiene urgencia, debe detectarla."""
        state = {
            "tenant_id": "tenant-test",
            "phone_number": "+541100000000",
            "messages": [
                HumanMessage(content="me siento muy mal, es una emergencia"),
                AIMessage(content="Entiendo, ¿me puede decir más?"),
                HumanMessage(content=""),  # mensaje vacío — el último
            ],
        }
        result = triage_node(state)
        # Con el fix H2, debe encontrar el HumanMessage anterior con contenido
        assert result["empathy_mode"] == "urgent"


# ============================================================
# Tests de falsos positivos — INTENT-06 (Plan 05-01)
# ============================================================

class TestTriageNodePainUrgencyKeywordFixes:
    """Verifica eliminación de falsos positivos de 'ardor' y 'sangre' (INTENT-06)."""

    def _make_state(self, text: str) -> dict:
        return {
            "tenant_id": "tenant-test",
            "phone_number": "+541100000000",
            "messages": [HumanMessage(content=text)],
        }

    def test_false_positive_analisis_de_sangre_no_urgency(self):
        """'análisis de sangre' (lab test) debe retornar empathy_mode='normal'."""
        state = self._make_state("necesito hacerme un análisis de sangre")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_false_positive_ardor_de_estomago_no_urgency(self):
        """'ardor de estomago' (heartburn inquiry) debe retornar empathy_mode='normal'."""
        state = self._make_state("tengo ardor de estomago, ¿hay algo para eso?")
        result = triage_node(state)
        assert result["empathy_mode"] == "normal"

    def test_sangrado_triggers_urgency(self):
        """'sangrado abundante' debe retornar empathy_mode='urgent'."""
        state = self._make_state("tengo sangrado abundante y no para")
        result = triage_node(state)
        assert result["empathy_mode"] == "urgent"

    def test_ardor_en_triggers_urgency(self):
        """'tengo ardor en el pecho' debe retornar empathy_mode='urgent'."""
        state = self._make_state("tengo ardor en el pecho desde hace un rato")
        result = triage_node(state)
        assert result["empathy_mode"] == "urgent"

    def test_sangrado_solo_triggers_urgency(self):
        """'sangrado' solo (no acompañado de 'análisis de') debe ser urgente."""
        state = self._make_state("sangrado, no para")
        result = triage_node(state)
        assert result["empathy_mode"] == "urgent"

    def test_vomito_sangre_still_triggers_urgency(self):
        """'vomito sangre' debe seguir siendo urgente (no regresión)."""
        state = self._make_state("vomito sangre desde hace media hora")
        result = triage_node(state)
        assert result["empathy_mode"] == "urgent"

    def test_me_duele_still_triggers_urgency(self):
        """'me duele' sigue siendo urgente — no regresión de tests existentes."""
        state = self._make_state("me duele mucho todo")
        result = triage_node(state)
        assert result["empathy_mode"] == "urgent"

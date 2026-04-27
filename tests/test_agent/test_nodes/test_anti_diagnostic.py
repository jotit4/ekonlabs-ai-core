"""Tests para app/agent/nodes/anti_diagnostic.py — anti_diagnostic_node (Story 2.5)."""
from unittest.mock import patch

from langchain_core.messages import AIMessage, HumanMessage

_TENANT_ID = "test-tenant-uuid"
_PHONE = "15551234567"


def _base_state(messages=None):
    return {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "messages": messages or [],
        "confidence_score": 1.0,
        "is_paused": False,
    }


def test_anti_diagnostic_detects_diagnostico_keyword():
    """Mensaje con keyword 'diagnóstico' → is_medical_query = True."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="quiero saber mi diagnóstico")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": True}


def test_anti_diagnostic_detects_receta_keyword():
    """Mensaje con keyword 'receta' → is_medical_query = True."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="necesito una receta para el dolor")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": True}


def test_anti_diagnostic_detects_que_tomo_keyword():
    """Mensaje con keyword 'qué tomo' → is_medical_query = True."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="qué tomo para la fiebre?")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": True}


def test_anti_diagnostic_detects_medicamento_keyword():
    """Mensaje con keyword 'medicamento' → is_medical_query = True."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="qué medicamento me recomiendan")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": True}


def test_anti_diagnostic_normal_message():
    """Mensaje sin keywords médicas → is_medical_query = False."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="quiero saber los precios de la consulta")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": False}


def test_anti_diagnostic_empty_messages():
    """Sin mensajes en estado → is_medical_query = False (fail-safe)."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    result = anti_diagnostic_node(_base_state(messages=[]))
    assert result == {"is_medical_query": False}


def test_anti_diagnostic_uses_last_human_message():
    """Debe analizar el último HumanMessage, ignorando mensajes previos."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    messages = [
        HumanMessage(content="necesito un diagnóstico urgente"),
        AIMessage(content="Lo siento, no puedo dar diagnósticos. ¿Le agendo un turno?"),
        HumanMessage(content="entonces quiero saber los precios"),
    ]
    state = _base_state(messages=messages)
    result = anti_diagnostic_node(state)
    # El último HumanMessage no tiene keywords médicas
    assert result == {"is_medical_query": False}


def test_anti_diagnostic_case_insensitive():
    """La detección es insensible a mayúsculas."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="QUIERO MI DIAGNOSTICO")])
    result = anti_diagnostic_node(state)
    assert result == {"is_medical_query": True}


def test_anti_diagnostic_returns_only_is_medical_query_key():
    """El nodo solo retorna la clave 'is_medical_query', no el estado completo."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    state = _base_state(messages=[HumanMessage(content="hola, ¿cuáles son los horarios?")])
    result = anti_diagnostic_node(state)
    assert set(result.keys()) == {"is_medical_query"}


def test_anti_diagnostic_failsafe_on_exception():
    """F6: Si ocurre una excepción inesperada → is_medical_query = TRUE (fail-safe inverted).

    Fail-safe direction changed in F6: must prove NOT medical to pass through.
    An exception means uncertainty → safest is to block (True), not allow (False).
    """
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    # Forzamos una excepción dentro del bloque try haciendo que state.get() lance RuntimeError
    state = _base_state(messages=[HumanMessage(content="quiero mi diagnóstico")])
    with patch.dict(state, {}, clear=False):
        class ExplodingState(dict):
            def get(self, key, default=None):
                if key == "messages":
                    raise RuntimeError("storage failure")
                return super().get(key, default)

        bad_state = ExplodingState(state)
        result = anti_diagnostic_node(bad_state)

    assert result == {"is_medical_query": True}


def test_anti_diagnostic_no_false_positive_scheduling_query():
    """Consulta de agendamiento no debe ser clasificada como médica."""
    from app.agent.nodes.anti_diagnostic import anti_diagnostic_node

    scheduling_messages = [
        "qué hago para agendar una cita?",
        "qué hago si quiero cancelar mi turno?",
        "sirve para adultos este servicio?",
        "quiero saber los precios de la consulta",
        "cómo reservo un turno?",
    ]
    for msg_text in scheduling_messages:
        state = _base_state(messages=[HumanMessage(content=msg_text)])
        result = anti_diagnostic_node(state)
        assert result == {"is_medical_query": False}, (
            f"Falso positivo detectado para mensaje: '{msg_text}'"
        )

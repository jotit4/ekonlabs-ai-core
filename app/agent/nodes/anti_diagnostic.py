"""Nodo: clasificador determinista anti-diagnóstico — detecta intención médica."""
from __future__ import annotations

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

MEDICAL_INTENT_KEYWORDS: frozenset[str] = frozenset({
    # Diagnóstico directo
    "diagnóstico", "diagnostico", "qué tengo", "que tengo",
    "qué enfermedad", "que enfermedad", "qué padezco", "que padezco",
    "qué me pasa", "que me pasa", "qué tengo yo", "que tengo yo",
    # Recetas y medicamentos
    "receta", "recetame", "recétame", "medicamento", "medicamentos",
    "remedio", "remedios", "pastilla", "pastillas",
    "antibiótico", "antibiotico", "antibióticos", "antibioticos",
    "analgésico", "analgesico", "antiinflamatorio", "antiinflamatorios",
    "dosis", "posología", "posologia",
    # Instrucción de uso de medicamentos
    "qué tomo", "que tomo", "qué tomar", "que tomar",
    "cuánto tomo", "cuanto tomo", "cuándo tomo", "cuando tomo",
    "puedo tomar", "puedo usar",
    # Síntomas y consultas de salud directas
    "tengo fiebre", "fiebre alta", "presión alta", "presion alta",
    "me duele el pecho", "dificultad para respirar",
    "qué me recomienda", "que me recomienda",
    "qué me recomiendas", "que me recomiendas",
    "cómo me curo", "como me curo", "que hago si tengo", "que hago si me",
    "es grave", "puede ser grave", "es peligroso",
    # Tratamiento casero / autónomo
    "tratamiento casero", "remedio casero", "remedio natural",
    "qué como", "que como", "qué como si", "que como si",
    "me automedico", "qué me automedico", "que me automedico",
})


def anti_diagnostic_node(state: ConversationState) -> dict:
    """Detecta intención de consulta médica (diagnóstico, recetas, síntomas).

    Escanea el ultimo HumanMessage del historial en busca de keywords de
    intencion medica. Retorna {"is_medical_query": True} o {"is_medical_query": False}.
    Nunca falla — cualquier error resulta en False (fail-safe, prefiere LLM a cortar flujo).

    Returns:
        dict con {"is_medical_query": True | False} — solo la clave cambiada.
    """
    tenant_id = state["tenant_id"]
    is_medical_query = False
    query = ""

    try:
        messages = state.get("messages") or []
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                query = msg.content
                break

        if query:
            query_lower = query.lower()
            if any(kw in query_lower for kw in MEDICAL_INTENT_KEYWORDS):
                is_medical_query = True
    except Exception as exc:
        logger.warning("anti_diagnostic_node.error", tenant_id=tenant_id, error=str(exc))
        is_medical_query = False

    logger.info(
        "anti_diagnostic_node.done",
        tenant_id=tenant_id,
        is_medical_query=is_medical_query,
        query_preview=query[:80],
    )
    return {"is_medical_query": is_medical_query}

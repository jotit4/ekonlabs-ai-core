"""Nodo: triage semántico para detección de dolor/urgencia (Story 2.4)."""
from __future__ import annotations

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

PAIN_URGENCY_KEYWORDS: frozenset[str] = frozenset({
    # Dolor físico — frases específicas (baja tasa de falsos positivos)
    "me duele",
    "duele",
    "dolor insoportable",
    "mucho dolor",
    "dolor severo",
    "ardor en",
    "ardor intenso",
    "ardor fuerte",
    "ardiendo",
    "golpe",
    "fractura",
    "fracturado",
    "fracturada",
    "lastimé",
    "lastimado",
    "sangrado",
    "sangrado abundante",
    "no para de sangrar",
    "herida abierta",
    "herida grave",
    "herido",
    # Urgencia / gravedad
    "urgente",
    "urgencia",
    "emergencia",
    "accidente",
    "inconsciente",
    "desmayo",
    "desmayado",
    "no puedo respirar",
    "me caí",
    "me caigo",
    "convulsión",
    "convulsiones",
    "vomito sangre",
    "fiebre alta",
    "no puedo moverme",
    "urgentemente",
    "no aguanto",
    "no puedo más",
    "no puedo mas",
    "ya no aguanto",
    "necesito hoy",
    "lo antes posible",
    "cuanto antes",
    "desesperado",
    "desesperada",
    # Angustia / distress emocional — frases específicas
    "muy mal",
    "llorando",
    "asustado",
    "asustada",
    "mucho miedo",
    "tengo mucho miedo",
    "mucha angustia",
    "me angustia mucho",
    "angustiado",
    "angustiada",
    "no sé qué hacer",
    "no se que hacer",
})


def triage_node(state: ConversationState) -> dict:
    """Detecta señales de dolor/urgencia en el último mensaje humano.

    Examina el último HumanMessage del historial y busca palabras clave de
    dolor o urgencia. Si encuentra alguna, establece empathy_mode="urgent";
    en caso contrario (o si ocurre cualquier error), empathy_mode="normal".

    El nodo es fail-safe: cualquier excepción inesperada resulta en "normal"
    para garantizar que el flujo principal nunca se interrumpa.

    Returns:
        dict con {"empathy_mode": "normal" | "urgent"}
    """
    tenant_id = state["tenant_id"]
    empathy_mode = "normal"
    query = ""
    try:
        messages = state.get("messages") or []
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human":
                content = getattr(msg, "content", "")
                if not content:
                    continue  # mensaje vacío — buscar el anterior
                query = content
                if any(kw in query.lower() for kw in PAIN_URGENCY_KEYWORDS):
                    empathy_mode = "urgent"
                break  # break solo cuando encontramos content real
    except Exception as exc:
        logger.warning(
            "triage_node.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        empathy_mode = "normal"

    logger.info(
        "triage_node.done",
        tenant_id=tenant_id,
        empathy_mode=empathy_mode,
        query_preview=query[:80],
    )
    return {"empathy_mode": empathy_mode}

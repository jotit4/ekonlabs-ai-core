"""Nodo: detectar intención de agendamiento y consultar disponibilidad en Google Calendar."""
from __future__ import annotations

import re
import unicodedata

from app.agent.state import ConversationState
from app.core.config import settings
from app.core.logging import get_logger
from app.services import calendar_service, tenant_service

logger = get_logger(__name__)


_NEGATIVE_PATTERNS: frozenset[str] = frozenset({
    "cuando abren",
    "que horario tienen",
    "horarios de atencion",
    "disponibilidad de informacion",
    "disponibilidad de informacion",
    "quiero consultar precios",
    "quiero consultar precio",
    "quiero consultar informacion",
})
_TIME_HINTS: frozenset[str] = frozenset({
    "hoy",
    "manana",
    "mañana",
    "semana",
    "lunes",
    "martes",
    "miercoles",
    "miércoles",
    "jueves",
    "viernes",
    "sabado",
    "sábado",
})
_DIRECT_PATTERNS: frozenset[str] = frozenset({
    "sacar turno",
    "pedir turno",
    "quiero una cita",
    "quiero ver al medico",
    "quiero ver al médico",
    "cuando pueden",
    "cuándo pueden",
    "cuando tienen",
    "cuándo tienen",
    "horario disponible",
    "proxima consulta",
    "próxima consulta",
    # Added INTENT-05: missing phrases wired into active classifier
    "quiero atencion",
    "hay algo para manana",
    "quisiera pedir hora",
})
_ACTION_TOKENS: frozenset[str] = frozenset({
    "turno",
    "turnos",
    "cita",
    "citas",
    "reservar",
    "reserva",
    "agendar",
    "agendamiento",
})
_SCHEDULING_CONTEXT_TOKENS: frozenset[str] = frozenset({
    "turno",
    "turnos",
    "cita",
    "citas",
    "agenda",
    "agendar",
    "reservar",
    "reserva",
    "medico",
    "médico",
    "doctor",
    "consulta",
})


def _normalize_text(text: str) -> str:
    """Normaliza texto para matching tolerante a tildes y espacios."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text.lower()).strip()


def has_scheduling_intent(query: str) -> bool:
    """Clasificador determinista con guardas para evitar falsos positivos comunes."""
    normalized_query = _normalize_text(query)
    if not normalized_query:
        return False

    if any(pattern in normalized_query for pattern in _NEGATIVE_PATTERNS):
        return False

    if any(pattern in normalized_query for pattern in _DIRECT_PATTERNS):
        return True

    tokens = set(re.findall(r"\b[\w']+\b", normalized_query))

    if tokens & _ACTION_TOKENS:
        return True

    if "quiero consultar" in normalized_query:
        return bool(tokens & _SCHEDULING_CONTEXT_TOKENS)

    if "disponibilidad" in tokens or "disponible" in tokens:
        return bool(tokens & (_SCHEDULING_CONTEXT_TOKENS | _TIME_HINTS))

    return False


def scheduling_node(state: ConversationState) -> dict:
    """Detecta intención de agendamiento y obtiene franjas horarias disponibles.

    Flujo:
        1. Extrae el último HumanMessage.
        2. Verifica si contiene alguna keyword de agendamiento.
        3. Si NO hay intent: retorna {"scheduling_intent": False} sin llamar al calendario.
        4. Si SÍ hay intent: obtiene calendar_id + credentials del tenant y consulta
           Google Calendar vía calendar_service.get_available_slots().
        5. Fail-safe: cualquier excepción retorna {"scheduling_intent": False}.

    Returns:
        dict con solo las claves modificadas — nunca el estado completo.
    """
    tenant_id = state["tenant_id"]
    query = ""

    try:
        messages = state.get("messages") or []
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                query = msg.content
                break

        # Detectar intención por keywords (clasificador determinista) — sin DB call
        has_intent = has_scheduling_intent(query)

        if not has_intent:
            logger.info(
                "scheduling_node.done",
                tenant_id=tenant_id,
                scheduling_intent=False,
                slots_count=0,
                query_preview=query[:80],
            )
            return {"scheduling_intent": False}

        # Solo si hay intención: obtener configuración del tenant
        tenant_config = tenant_service.get_tenant_config(tenant_id)

        # Kill switch: si shadow_mode_enabled=True, el agente no gestiona turnos
        if getattr(tenant_config, "shadow_mode_enabled", False):
            logger.info("scheduling_node.shadow_mode_active", tenant_id=tenant_id)
            return {"scheduling_intent": False, "shadow_mode_active": True}

        calendar_id = tenant_config.calendar_id
        credentials_dict = tenant_config.calendar_credentials

        if not calendar_id:
            logger.warning(
                "scheduling_node.no_calendar_id",
                tenant_id=tenant_id,
            )
            logger.info(
                "scheduling_node.done",
                tenant_id=tenant_id,
                scheduling_intent=True,
                slots_count=0,
                query_preview=query[:80],
            )
            return {"scheduling_intent": True, "available_slots": []}

        slots = calendar_service.get_available_slots(
            calendar_id=calendar_id,
            credentials_dict=credentials_dict or {},
            duration_minutes=settings.DEFAULT_SLOT_DURATION_MINUTES,
            lookahead_hours=settings.SCHEDULING_LOOKAHEAD_HOURS,
        )

    except Exception as exc:
        logger.error("scheduling_node.error", tenant_id=tenant_id, error=str(exc))
        return {"scheduling_intent": False}

    logger.info(
        "scheduling_node.done",
        tenant_id=tenant_id,
        scheduling_intent=True,
        slots_count=len(slots),
        query_preview=query[:80],
    )
    return {"scheduling_intent": True, "available_slots": slots}

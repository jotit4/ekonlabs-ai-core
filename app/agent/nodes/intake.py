"""Nodo: bienvenida inicial (entry-point del graph).

Turn 1 (intake_complete no existe en state): envía mensaje de bienvenida
y marca intake_complete=True de inmediato — el paciente pasa a triage
en su siguiente mensaje.

Turn 2+ (intake_complete=True): pass-through sin efectos secundarios.

El DNI se solicita más adelante, cuando el paciente muestra intención
de agendar un turno o consultar disponibilidad (flujo Phase B del booking_node).
"""
from __future__ import annotations

from langchain_core.messages import AIMessage

from app.agent.state import ConversationState
from app.core.logging import get_logger
from app.services import booking_draft_service

logger = get_logger(__name__)

WELCOME_MESSAGE = (
    "¡Hola! Soy la asistente virtual de ISADI 👋\n\n"
    "¿En qué puedo ayudarte hoy?"
)


def intake_node(state: ConversationState) -> dict:
    """Envía bienvenida en el primer contacto y marca intake como completo."""
    tenant_id = state["tenant_id"]
    phone_number = state["phone_number"]

    try:
        if state.get("intake_complete", False):
            return {}

        booking_draft_service.save_draft(tenant_id, phone_number, {
            "intake_complete": True,
        })
        logger.info("intake_node.welcome_sent", tenant_id=tenant_id)
        return {
            "intake_complete": True,
            "messages": [AIMessage(content=WELCOME_MESSAGE)],
        }

    except Exception as exc:
        logger.error("intake_node.error", tenant_id=tenant_id, error=str(exc))
        return {"intake_complete": True}

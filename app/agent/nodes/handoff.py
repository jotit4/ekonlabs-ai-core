"""Nodo: registrar evento de handoff cuando is_paused=True."""
from __future__ import annotations

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)


def handoff_node(state: ConversationState) -> dict:
    """Registra el evento de handoff al operador con log estructurado.

    Minimum viable implementation per STATE.md: operator notification OR clear log entry.
    Sends no WhatsApp message — notification_service.py is a stub and remains deferred.

    Returns:
        dict vacío — este nodo no muta el estado de la conversación.
    """
    tenant_id = state["tenant_id"]
    try:
        logger.info(
            "handoff_node.operator_notified",
            tenant_id=tenant_id,
            phone_number=state.get("phone_number"),
            confidence_score=state.get("confidence_score"),
            reason="low_confidence_pause",
        )
        # Future: notification_service.notify_operator(tenant_id, state["phone_number"])
        # Deferred — see REQUIREMENTS.md "Future Requirements"
    except Exception as exc:
        logger.warning("handoff_node.error", tenant_id=tenant_id, error=str(exc))
    return {}

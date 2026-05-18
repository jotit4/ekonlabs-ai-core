"""Nodo: bienvenida inicial (entry-point del graph).

Turn 1 (intake_complete=False): marca intake_complete=True e is_first_contact=True
en el state y continúa a triage en el mismo turno. generation_node inyecta el saludo
en su respuesta — un solo mensaje WhatsApp, sin perder el pedido real del paciente.

Turn 2+ (intake_complete=True): pass-through sin efectos secundarios.
"""
from __future__ import annotations

from app.agent.state import ConversationState
from app.core.logging import get_logger
from app.services.booking_draft_service import update_draft

logger = get_logger(__name__)


def intake_node(state: ConversationState) -> dict:
    """Marca el primer contacto y continúa a triage en el mismo turno."""
    tenant_id = state["tenant_id"]
    phone_number = state["phone_number"]

    try:
        if state.get("intake_complete", False):
            return {}

        update_draft(tenant_id, phone_number, {"intake_complete": True})
        logger.info("intake_node.first_contact", tenant_id=tenant_id)
        return {"intake_complete": True, "is_first_contact": True}

    except Exception as exc:
        logger.error("intake_node.error", tenant_id=tenant_id, error=str(exc))
        return {}

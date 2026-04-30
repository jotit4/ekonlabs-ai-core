"""Nodo: identificación temprana por DNI (reemplaza consent F0.3).

Entry-point del graph. Flujo:
  Turn 1 (intake_attempts == 0): envía bienvenida + pide DNI. Guarda intake_attempts=1.
  Turn 2 (intake_attempts == 1): extrae DNI del último mensaje humano con regex.
      - DNI encontrado → busca paciente en DB, guarda intake_complete=True + datos.
      - DNI no encontrado → si attempts < 2 pide de nuevo; si >= 2 marca intake_complete=True.
  intake_complete=True (cualquier turno): pass-through → devuelve {} inmediatamente.
"""
from __future__ import annotations

import re

from langchain_core.messages import AIMessage

from app.agent.state import ConversationState
from app.core.logging import get_logger
from app.services import booking_draft_service
from app.services.patient_service import get_patient_by_dni

logger = get_logger(__name__)

WELCOME_MESSAGE = (
    "¡Hola! Soy la asistente virtual de ISADI 👋\n\n"
    "Para poder atenderte mejor, ¿me decís tu número de DNI?"
)

DNI_RETRY_MESSAGE = (
    "No pude identificar tu DNI. "
    "¿Podés enviarlo solo, sin puntos? Por ejemplo: *12345678*"
)

# Regex: 7 u 8 dígitos, con word-boundary, ignorando puntos y comas antes de buscar
_DNI_RE = re.compile(r"\b(\d{7,8})\b")


def _extract_dni(text: str) -> str | None:
    """Extrae un DNI de 7-8 dígitos del texto (limpiando puntos/comas primero)."""
    cleaned = re.sub(r"[.,]", "", text)
    match = _DNI_RE.search(cleaned)
    return match.group(1) if match else None


def _last_human_text(state: ConversationState) -> str:
    """Retorna el contenido del último HumanMessage o cadena vacía."""
    for msg in reversed(state.get("messages") or []):
        if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
            return msg.content
    return ""


def intake_node(state: ConversationState) -> dict:
    """Identifica al paciente por DNI antes de continuar al triage."""
    tenant_id = state["tenant_id"]
    phone_number = state["phone_number"]

    try:
        # Pass-through: intake ya completado en este hilo
        if state.get("intake_complete", False):
            return {}

        attempts = state.get("intake_attempts", 0)

        # Turn 1: bienvenida + pedir DNI
        if attempts == 0:
            booking_draft_service.save_draft(tenant_id, phone_number, {
                "intake_attempts": 1,
                "intake_complete": False,
            })
            logger.info("intake_node.welcome_sent", tenant_id=tenant_id)
            return {
                "intake_attempts": 1,
                "messages": [AIMessage(content=WELCOME_MESSAGE)],
            }

        # Turn 2+: intentar extraer DNI
        last_text = _last_human_text(state)
        dni = _extract_dni(last_text)

        if dni:
            # DNI encontrado — buscar paciente en DB
            draft_update: dict = {
                "intake_complete": True,
                "intake_attempts": attempts,
                "patient_dni": dni,
            }
            state_update: dict = {
                "intake_complete": True,
                "intake_attempts": attempts,
                "patient_dni": dni,
            }

            try:
                patient = get_patient_by_dni(tenant_id, dni)
                if patient:
                    draft_update["patient_id"] = patient.get("patient_id")
                    draft_update["patient_name"] = patient.get("full_name")
                    state_update["patient_id"] = patient.get("patient_id")
                    state_update["patient_name"] = patient.get("full_name")
                    logger.info(
                        "intake_node.patient_found",
                        tenant_id=tenant_id,
                        patient_id=patient.get("patient_id"),
                    )
                else:
                    logger.info("intake_node.patient_not_found", tenant_id=tenant_id)
            except Exception as exc:
                logger.warning(
                    "intake_node.db_lookup_error",
                    tenant_id=tenant_id,
                    error=str(exc),
                )

            booking_draft_service.save_draft(tenant_id, phone_number, draft_update)
            return state_update

        # DNI no encontrado
        new_attempts = attempts + 1
        if new_attempts >= 2:
            # Agotamos intentos — marcar completo y seguir
            booking_draft_service.save_draft(tenant_id, phone_number, {
                "intake_complete": True,
                "intake_attempts": new_attempts,
            })
            logger.info(
                "intake_node.max_attempts_reached",
                tenant_id=tenant_id,
                attempts=new_attempts,
            )
            return {
                "intake_complete": True,
                "intake_attempts": new_attempts,
            }

        # Pedir DNI de nuevo
        booking_draft_service.save_draft(tenant_id, phone_number, {
            "intake_attempts": new_attempts,
            "intake_complete": False,
        })
        logger.info(
            "intake_node.retry_requested",
            tenant_id=tenant_id,
            attempts=new_attempts,
        )
        return {
            "intake_attempts": new_attempts,
            "messages": [AIMessage(content=DNI_RETRY_MESSAGE)],
        }

    except Exception as exc:
        logger.error("intake_node.error", tenant_id=tenant_id, error=str(exc))
        # Fail-safe: marcar completo para no bloquear el flujo
        return {"intake_complete": True}

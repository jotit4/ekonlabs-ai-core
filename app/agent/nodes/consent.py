"""Nodo: verificación de consentimiento informado (F0.3 — Ley 25.326).

Entry-point del graph para pacientes nuevos. Flujo:
  1. Si ya tiene consentimiento activo → consent_given=True → continúa al triage.
  2. Si el mensaje es una respuesta afirmativa y hay una solicitud pendiente →
     registra consentimiento → consent_given=True → continúa.
  3. Si no hay consentimiento → envía mensaje de solicitud → consent_given=False → END.

El flag de solicitud pendiente se guarda en Redis con TTL 24h para no volver a
pedir consentimiento en cada mensaje dentro de la misma ventana.
"""
from __future__ import annotations

import re

from langchain_core.messages import AIMessage
from redis import Redis

from app.agent.state import ConversationState
from app.core.config import settings
from app.core.logging import get_logger
from app.logging.processors import hash_pii
from app.services.consent_service import has_active_consent, record_consent

logger = get_logger(__name__)

CONSENT_REQUEST_TEXT = (
    "Hola 👋 Soy la asistente virtual de la clínica.\n\n"
    "Antes de continuar, necesito tu autorización para procesar tus datos personales "
    "(nombre, teléfono, DNI y turnos) con el fin de gestionar tus citas. "
    "Los datos se tratan conforme a la Ley 25.326 de Protección de Datos Personales.\n\n"
    "¿Aceptás? Respondé *SI* para confirmar y continuar."
)

_CONSENT_YES = re.compile(
    r"^\s*(si|sí|s[iíì]|yes|acepto|acepto los datos|autorizo|ok|dale|claro)\s*$",
    re.IGNORECASE,
)

_CONSENT_PENDING_TTL = 86_400  # 24 h


def _get_redis() -> Redis:
    return Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _pending_key(tenant_id: str, phone_hash: str) -> str:
    return f"consent_pending:{tenant_id}:{phone_hash}"


def _is_consent_reply(text: str) -> bool:
    return bool(_CONSENT_YES.match(text.strip()))


def consent_node(state: ConversationState) -> dict:
    """Verifica o recolecta consentimiento antes de procesar cualquier mensaje."""
    tenant_id = state["tenant_id"]
    phone_number = state["phone_number"]
    phone_hash = hash_pii(phone_number)

    try:
        # Fast path: already consented
        if has_active_consent(tenant_id, phone_number):
            return {"consent_given": True}

        # Check if current message is a consent reply with a pending request
        messages = state.get("messages") or []
        last_human_text = ""
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                last_human_text = msg.content
                break

        if last_human_text and _is_consent_reply(last_human_text):
            try:
                redis = _get_redis()
                key = _pending_key(tenant_id, phone_hash)
                if redis.exists(key):
                    redis.delete(key)
                    record_consent(tenant_id, phone_number)
                    logger.info(
                        "consent_node.consent_granted",
                        tenant_id=tenant_id,
                    )
                    return {"consent_given": True}
            except Exception as exc:
                logger.warning(
                    "consent_node.redis_check_failed",
                    tenant_id=tenant_id,
                    error=str(exc),
                )
                # If Redis is unavailable, record consent anyway (patient said SI)
                record_consent(tenant_id, phone_number)
                return {"consent_given": True}

        # No consent — send request and set pending flag
        try:
            redis = _get_redis()
            redis.set(_pending_key(tenant_id, phone_hash), "1", ex=_CONSENT_PENDING_TTL)
        except Exception as exc:
            logger.warning(
                "consent_node.redis_set_failed",
                tenant_id=tenant_id,
                error=str(exc),
            )

        logger.info("consent_node.consent_requested", tenant_id=tenant_id)
        return {
            "consent_given": False,
            "messages": [AIMessage(content=CONSENT_REQUEST_TEXT)],
        }

    except Exception as exc:
        logger.error(
            "consent_node.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        # Fail-safe: block on error
        return {
            "consent_given": False,
            "messages": [AIMessage(content=CONSENT_REQUEST_TEXT)],
        }

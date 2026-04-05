"""Nodo: detectar confirmación/cancelación de turno e interactuar con Google Calendar."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

from app.agent.state import ConversationState
from app.core.config import settings
from app.core.logging import get_logger
from app.services import calendar_service, tenant_service

logger = get_logger(__name__)

BOOKING_CONFIRM_KEYWORDS: frozenset[str] = frozenset({
    "el 1",
    "el 2",
    "el 3",
    "el primero",
    "el segundo",
    "el tercero",
    "la primera",
    "la segunda",
    "la tercera",
    "quiero ese",
    "ese me viene",
    "ese horario",
    "confirmo",
    "confirmado",
    "acepto",
    "quiero ese turno",
    "me quedo con",
    "lo confirmo",
    "voy a ir",
    "perfecto ese",
    "ese esta bien",
    "ese está bien",
    # Argentine colloquial slot confirmations (INTENT-02)
    "dale",
    "listo",
    "va",
    "anotame",
    "poneme",
    "agendame",
    "reservame",
    "tomame ese",
})

BOOKING_CANCEL_KEYWORDS: frozenset[str] = frozenset({
    "cancelar",
    "cancelo",
    "cancela",
    "cancelar turno",
    "cancelar mi turno",
    "cancelar cita",
    "no puedo ir",
    "no voy a poder",
    "no voy a ir",
    "quiero cancelar",
    "necesito cancelar",
})

SLOT_INDEX_MAP: dict[str, int] = {
    "1": 0, "el 1": 0, "el primero": 0, "la primera": 0,
    "2": 1, "el 2": 1, "el segundo": 1, "la segunda": 1,
    "3": 2, "el 3": 2, "el tercero": 2, "la tercera": 2,
}


def _normalize_text(text: str) -> str:
    """Normaliza texto para matching tolerante a tildes y espacios."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text.lower()).strip()


def _detect_slot_index(normalized_query: str) -> int | None:
    """Retorna el índice del slot seleccionado (0, 1 o 2), o None si no hay match claro.

    Phrase keys (multi-word) use substring matching — no ambiguity risk.
    Digit keys ("1", "2", "3") use word-boundary regex to prevent false matches
    on "14:30" or "21 de abril".
    """
    PHRASE_KEYS = {
        "el primero": 0, "la primera": 0,
        "el segundo": 1, "la segunda": 1,
        "el tercero": 2, "la tercera": 2,
    }
    DIGIT_KEYS = {"1": 0, "2": 1, "3": 2}
    # Word phrases first (no digits) — safe substring matching
    for key, idx in PHRASE_KEYS.items():
        if key in normalized_query:
            return idx
    # "el N" patterns — use word-boundary on the digit to avoid "el 21" matching "el 2"
    for digit, idx in DIGIT_KEYS.items():
        if re.search(rf"\bel {digit}\b", normalized_query):
            return idx
    # Bare digit keys — word-boundary only
    for digit, idx in DIGIT_KEYS.items():
        if re.search(rf"\b{digit}\b", normalized_query):
            return idx
    return None  # No match — ambiguous selection


def booking_node(state: ConversationState) -> dict:
    """Detecta confirmación o cancelación de turno y ejecuta la acción en Google Calendar.

    Flujo:
        1. Extrae el último HumanMessage.
        2. Detecta si es cancelación (BOOKING_CANCEL_KEYWORDS) o confirmación (BOOKING_CONFIRM_KEYWORDS).
        3. Si NO hay ninguna intent: retorna {"booking_intent": False} sin llamar al calendario.
        4. Flujo cancelación: busca evento por phone_number → elimina si existe.
        5. Flujo confirmación: re-consulta disponibilidad → crea evento con slot elegido.
        6. Fail-safe: cualquier excepción retorna {"booking_intent": False}.

    Returns:
        dict con solo las claves modificadas — nunca el estado completo.
    """
    tenant_id = state["tenant_id"]
    phone_number = state["phone_number"]
    query = ""

    try:
        messages = state.get("messages") or []
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                query = msg.content
                break

        normalized_query = _normalize_text(query)
        # Pad with spaces so short keywords like "va" match whole words only
        padded_query = f" {normalized_query} "

        # Detectar acción — sin DB call
        is_cancel = any(f" {kw} " in padded_query for kw in BOOKING_CANCEL_KEYWORDS)
        is_confirm = any(f" {kw} " in padded_query for kw in BOOKING_CONFIRM_KEYWORDS)

        if not is_cancel and not is_confirm:
            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=False,
                booking_action=None,
                calendar_event_id=None,
                query_preview=query[:80],
            )
            return {"booking_intent": False}

        # Solo si hay intención: obtener configuración del tenant
        tenant_config = tenant_service.get_tenant_config(tenant_id)

        # Kill switch: si shadow_mode_enabled=True, el agente no gestiona turnos
        if getattr(tenant_config, "shadow_mode_enabled", False):
            logger.info("booking_node.shadow_mode_active", tenant_id=tenant_id)
            return {"booking_intent": False, "shadow_mode_active": True}

        # Cancelación tiene precedencia sobre confirmación si ambas se detectan
        booking_action = "cancel" if is_cancel else "confirm"

        calendar_id = tenant_config.calendar_id
        credentials_dict = tenant_config.calendar_credentials or {}

        if not calendar_id:
            logger.warning("booking_node.no_calendar_id", tenant_id=tenant_id)
            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=True,
                booking_action=booking_action,
                calendar_event_id=None,
                query_preview=query[:80],
            )
            return {"booking_intent": True, "booking_action": booking_action, "calendar_event_id": None}

        # ── Flujo cancelación ──────────────────────────────────────────────
        if booking_action == "cancel":
            event_id = calendar_service.find_event_by_phone(
                calendar_id=calendar_id,
                credentials_dict=credentials_dict,
                phone_number=phone_number,
                lookahead_hours=settings.SCHEDULING_LOOKAHEAD_HOURS,
            )
            if event_id:
                calendar_service.delete_event(
                    calendar_id=calendar_id,
                    credentials_dict=credentials_dict,
                    event_id=event_id,
                )

            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=True,
                booking_action="cancel",
                calendar_event_id=event_id,
                query_preview=query[:80],
            )
            return {
                "booking_intent": True,
                "booking_action": "cancel",
                "calendar_event_id": event_id,
            }

        # ── Flujo confirmación ─────────────────────────────────────────────
        selected_idx = _detect_slot_index(normalized_query)

        if selected_idx is None:
            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=True,
                booking_action="confirm",
                booking_ambiguous_slot=True,
                query_preview=query[:80],
            )
            return {
                "booking_intent": True,
                "booking_action": "confirm",
                "booking_ambiguous_slot": True,
                "calendar_event_id": None,
            }

        # INFRA-05: Read cached slots from state first to eliminate the race window.
        # scheduling_node stores available_slots in state when presenting options.
        # Only re-fetch if state slots are absent or empty (e.g., conversation resumed).
        slots = state.get("available_slots") or calendar_service.get_available_slots(
            calendar_id=calendar_id,
            credentials_dict=credentials_dict,
            duration_minutes=settings.DEFAULT_SLOT_DURATION_MINUTES,
            lookahead_hours=settings.SCHEDULING_LOOKAHEAD_HOURS,
        )

        if not slots:
            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=True,
                booking_action="confirm",
                calendar_event_id=None,
                query_preview=query[:80],
            )
            return {
                "booking_intent": True,
                "booking_action": "confirm",
                "calendar_event_id": None,
            }

        # Si el índice pedido supera los slots disponibles, usar el primero
        actual_idx = selected_idx if selected_idx < len(slots) else 0
        chosen_slot = slots[actual_idx]

        # NAME-02: Defer event creation until patient name is collected
        if not state.get("patient_name"):
            logger.info(
                "booking_node.name_collection_deferred",
                tenant_id=tenant_id,
                slot_display=chosen_slot.get("display", ""),
                query_preview=query[:80],
            )
            return {
                "booking_intent": True,
                "booking_action": "confirm",
                "name_collection_active": True,
                "booked_slot": chosen_slot,
                "selected_slot_index": actual_idx,
                "slot_presented_at": datetime.now(timezone.utc).isoformat(),
                "calendar_event_id": None,
            }

        # NAME-03: Patient name present — create event with name in title
        patient_name: str = state["patient_name"]
        event_id = calendar_service.create_event(
            calendar_id=calendar_id,
            credentials_dict=credentials_dict,
            start_iso=chosen_slot["start"],
            end_iso=chosen_slot["end"],
            phone_number=phone_number,
            title=f"Turno — {patient_name}",
        )

    except Exception as exc:
        logger.error("booking_node.error", tenant_id=tenant_id, error=str(exc))
        return {"booking_intent": False}

    logger.info(
        "booking_node.done",
        tenant_id=tenant_id,
        booking_intent=True,
        booking_action="confirm",
        calendar_event_id=event_id,
        query_preview=query[:80],
    )
    return {
        "booking_intent": True,
        "booking_action": "confirm",
        "booked_slot": chosen_slot,
        "calendar_event_id": event_id,
        "selected_slot_index": actual_idx,
    }

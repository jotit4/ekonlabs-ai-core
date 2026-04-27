"""Nodo: detectar confirmación/cancelación de turno e interactuar con Google Calendar."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

from app.agent.state import ConversationState
from app.core.config import settings
from app.core.logging import get_logger
from app.services import booking_draft_service, calendar_service, patient_service, tenant_service
from app.services.vault_client import resolve_calendar_credentials

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
    # Generic affirmatives — must match <palabras_confirmacion> in system prompt.
    # Without these, patients saying "sí" or "ok" after seeing slots fall through
    # to the general RAG path where the LLM hallucinates a booking confirmation.
    # _detect_slot_index will return None for these (no slot number → ambiguous_slot=True),
    # so the agent correctly asks "¿Cuál de los tres?" instead of faking a booking.
    "sí",
    "si",
    "ok",
    "okay",
    "okey",
    "sep",
    "perfecto",
    "bárbaro",
    "barbaro",
    "adelante",
    "esta bien",
    "está bien",
    "de acuerdo",
    "me quedo con ese",
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


def _detect_slot_index(normalized_query: str, available_slots: list[dict] | None = None) -> int | None:
    """Retorna el índice del slot seleccionado (0, 1 o 2), o None si no hay match claro.

    Estrategias en orden de prioridad:
    1. Frases ordinales ("el primero", "el segundo", etc.)
    2. "el N" con word-boundary para evitar falsos positivos en fechas
    3. Dígito suelto con word-boundary
    4. Hora mencionada ("a las 11", "las 10", "9 hs") cruzada contra available_slots
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
    # Time-based selection: "a las 11", "las 10", "las 9", "11 hs", "10:00", etc.
    if available_slots:
        hour_match = re.search(r"\b(\d{1,2})(?::00)?\s*(?:hs|h|hrs)?\b", normalized_query)
        if hour_match:
            mentioned_hour = int(hour_match.group(1))
            for idx, slot in enumerate(available_slots[:3]):
                try:
                    from datetime import datetime
                    slot_dt = datetime.fromisoformat(slot["start"])
                    if slot_dt.hour == mentioned_hour:
                        return idx
                except (ValueError, KeyError):
                    pass
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
            # INFRA-06: LangGraph has no checkpointer — state resets every turn.
            # If a registration is in progress (name or DNI collection), re-hydrate
            # from Redis draft so generation_node can continue the flow.
            draft = booking_draft_service.get_draft(tenant_id, phone_number)
            if draft and (draft.get("name_collection_active") or draft.get("dni_collection_active")):
                logger.info(
                    "booking_node.draft_rehydrated",
                    tenant_id=tenant_id,
                    name_collection_active=draft.get("name_collection_active"),
                    dni_collection_active=draft.get("dni_collection_active"),
                )
                return {
                    "booking_intent": True,
                    "booking_action": "confirm",
                    **{k: v for k, v in draft.items() if v is not None},
                }
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

        try:
            credentials_dict = resolve_calendar_credentials(
                tenant_config.calendar_credentials_ref,
                tenant_config.calendar_credentials,
            )
        except ValueError:
            credentials_dict = {}
        service_name = state.get("selected_service_name")
        selected_service_id = state.get("selected_service_id")

        # v1.3: usar calendar_id del servicio si está disponible
        if selected_service_id:
            services = tenant_service.get_tenant_services(tenant_id)
            svc = next((s for s in services if str(s.service_id) == selected_service_id), None)
            calendar_id = svc.calendar_id if svc else tenant_config.calendar_id
        else:
            calendar_id = tenant_config.calendar_id

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

        # ── Cancel 2-step: intercept pending cancel confirmation ──────────────
        # Must run before the cancel/confirm split below so that a patient
        # saying "SI" after "¿confirmás cancelar?" is not mis-routed to booking.
        existing_draft = booking_draft_service.get_draft(tenant_id, phone_number)
        if existing_draft and existing_draft.get("pending_cancellation"):
            if is_confirm and not is_cancel:
                # Second step confirmed — execute the pending cancel
                pending_event_id = existing_draft.get("cancel_event_id")
                booking_draft_service.delete_draft(tenant_id, phone_number)
                if pending_event_id:
                    calendar_service.delete_event(
                        calendar_id=calendar_id,
                        credentials_dict=credentials_dict,
                        event_id=pending_event_id,
                    )
                    patient_service.cancel_appointment_by_event_id(pending_event_id)
                logger.info(
                    "booking_node.done",
                    tenant_id=tenant_id,
                    booking_intent=True,
                    booking_action="cancel",
                    calendar_event_id=pending_event_id,
                    query_preview=query[:80],
                )
                return {
                    "booking_intent": True,
                    "booking_action": "cancel",
                    "calendar_event_id": pending_event_id,
                }
            else:
                # Patient said "cancelar" again or something else — re-present confirmation
                logger.info(
                    "booking_node.done",
                    tenant_id=tenant_id,
                    booking_intent=True,
                    booking_action="cancel_pending",
                    calendar_event_id=existing_draft.get("cancel_event_id"),
                    query_preview=query[:80],
                )
                return {
                    "booking_intent": True,
                    "booking_action": "cancel_pending",
                    "calendar_event_id": existing_draft.get("cancel_event_id"),
                }

        # ── Flujo cancelación ──────────────────────────────────────────────
        if booking_action == "cancel":
            # Use 2× the booking window (minimum 2 weeks) so patients can cancel
            # appointments booked further ahead than the standard lookahead.
            cancel_lookahead = max(settings.SCHEDULING_LOOKAHEAD_HOURS * 2, 336)
            event_id = calendar_service.find_event_by_phone(
                calendar_id=calendar_id,
                credentials_dict=credentials_dict,
                phone_number=phone_number,
                lookahead_hours=cancel_lookahead,
            )
            # First step: save pending state and ask for explicit confirmation
            booking_draft_service.save_draft(tenant_id, phone_number, {
                "pending_cancellation": True,
                "cancel_event_id": event_id,
            })
            logger.info(
                "booking_node.done",
                tenant_id=tenant_id,
                booking_intent=True,
                booking_action="cancel_pending",
                calendar_event_id=event_id,
                query_preview=query[:80],
            )
            return {
                "booking_intent": True,
                "booking_action": "cancel_pending",
                "calendar_event_id": event_id,
            }

        # ── Flujo confirmación ─────────────────────────────────────────────
        cached_slots = state.get("available_slots") or []
        selected_idx = _detect_slot_index(normalized_query, cached_slots)

        if selected_idx is None:
            # Si el mensaje no tiene número de slot pero ya hay un slot seleccionado en state
            # (ej: "si confirmo" después de dar el nombre), reusar el booked_slot existente.
            existing_booked_slot = state.get("booked_slot")
            if existing_booked_slot:
                chosen_slot = existing_booked_slot
                actual_idx = state.get("selected_slot_index") or 0
            else:
                # INFRA-06: state reset — try Redis draft as fallback
                draft = booking_draft_service.get_draft(tenant_id, phone_number)
                if draft and draft.get("booked_slot"):
                    chosen_slot = draft["booked_slot"]
                    actual_idx = draft.get("selected_slot_index", 0)
                else:
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
        else:
            # INFRA-05: Read cached slots from state first to eliminate the race window.
            # scheduling_node stores available_slots in state when presenting options.
            # Only re-fetch if state slots are absent or empty (e.g., conversation resumed).
            slots = cached_slots or calendar_service.get_available_slots(
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

        # v1.4: lookup paciente existente por phone_number para skip de recolección
        patient_name_state: str | None = state.get("patient_name")
        existing_patient_id: str | None = state.get("patient_id")
        extra_state: dict = {}

        if not patient_name_state:
            existing = patient_service.get_patient_by_phone(tenant_id, phone_number)
            if existing:
                # Paciente conocido — pre-popular datos y saltar recolección
                patient_name_state = existing.full_name
                existing_patient_id = existing.patient_id
                extra_state = {
                    "patient_name": existing.full_name,
                    "patient_dni": existing.dni,
                    "patient_id": existing.patient_id,
                }

        # Diferir si aún no tenemos nombre (primer contacto)
        if not patient_name_state:
            slot_presented_at = datetime.now(timezone.utc).isoformat()
            # INFRA-06: persist registration state to Redis — LangGraph state resets each turn.
            booking_draft_service.save_draft(tenant_id, phone_number, {
                "name_collection_active": True,
                "booked_slot": chosen_slot,
                "selected_slot_index": actual_idx,
                "selected_service_name": service_name,
                "selected_service_id": selected_service_id,
                "slot_presented_at": slot_presented_at,
                "name_attempts": 0,
                "patient_name": None,
                "dni_collection_active": False,
                "dni_attempts": 0,
                "patient_dni": None,
            })
            logger.info(
                "booking_node.registration_deferred",
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
                "slot_presented_at": slot_presented_at,
                "calendar_event_id": None,
            }

        # Paciente conocido (state o DB) — crear evento directamente
        patient_name: str = patient_name_state
        patient_dni: str | None = state.get("patient_dni") or (
            extra_state.get("patient_dni") if extra_state else None
        )
        event_title = f"{service_name} — {patient_name}" if service_name else f"Turno — {patient_name}"
        event_id = calendar_service.create_event(
            calendar_id=calendar_id,
            credentials_dict=credentials_dict,
            start_iso=chosen_slot["start"],
            end_iso=chosen_slot["end"],
            phone_number=phone_number,
            title=event_title,
        )

        # v1.4: persistir appointment en DB si tenemos patient_id (fail-safe)
        pid = existing_patient_id or state.get("patient_id")
        if pid and event_id:
            try:
                patient_service.create_appointment(
                    tenant_id=tenant_id,
                    patient_id=pid,
                    service_id=selected_service_id,
                    calendar_event_id=event_id,
                    start_iso=chosen_slot["start"],
                    end_iso=chosen_slot["end"],
                )
            except Exception as appt_exc:
                logger.error(
                    "booking_node.appointment_error",
                    tenant_id=tenant_id,
                    error=str(appt_exc),
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
    result = {
        "booking_intent": True,
        "booking_action": "confirm",
        "booked_slot": chosen_slot,
        "calendar_event_id": event_id,
        "selected_slot_index": actual_idx,
    }
    result.update(extra_state)
    return result

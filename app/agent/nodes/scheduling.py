"""Nodo: detectar intención de agendamiento y consultar disponibilidad en Google Calendar."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.agent.state import ConversationState
from app.core.config import settings
from app.core.logging import get_logger
from app.models.tenant import Service
from app.services import calendar_service, tenant_service
from app.services.vault_client import resolve_calendar_credentials

logger = get_logger(__name__)

_classifier_llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0, request_timeout=10)


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


# ── Booking mode: gated service — prerequisite confirmation keywords ─────────
# Frases (normalizadas, sin tildes) que indican que el paciente ya tuvo la consulta
# médica previa requerida para acceder a un servicio gated (ej: aquagym/hidroterapia).
# El matching se aplica sobre _normalize_text(query) para tolerar variantes.
GATED_PREREQUISITE_MET_KEYWORDS: frozenset[str] = frozenset({
    "ya fui",
    "ya tuve",
    "ya tuve la consulta",
    "ya fui al dr",
    "ya vi al dr",
    "ya vi al doctor",
    "ya consulte",
    "ya hice la consulta",
    "ya fui a la consulta",
    "ya tuve la consulta previa",
    "ya fui con el dr",
    "ya fui con el medico",
    "el dr me dijo",
    "el doctor me dijo",
    "el dr me indico",
    "el doctor me indico",
    "el medico me dijo",
    "me indico que",
    "me indicaron",
    "me derivaron",
    "me mandaron",
    "me dieron el ok",
    "me recomendo",
    "ya lo vi",
    "me dijeron que haga",
    "me dijeron hacer",
})


# ── Detección de contexto de fecha ──────────────────────────────────────────

# Zona horaria local del tenant (Argentina no tiene DST, UTC-3 fijo)
_TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")

_OTHER_DAY_PATTERNS: frozenset[str] = frozenset({
    "otro dia", "otro día", "otro horario", "otra fecha", "otro momento",
    "cuando mas", "cuando más", "hay otro", "mas opciones", "más opciones",
    "no puedo ese", "no puedo mañana", "no puedo manana", "no puedo el",
    "no me viene", "no me sirve", "no me queda",
    "tenes otro", "tenés otro", "tienen otro",
    "otro turno", "otro dia disponible", "otro día disponible",
})

_DAY_NAMES_TO_WEEKDAY: dict[str, int] = {
    "lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2,
    "jueves": 3, "viernes": 4, "sabado": 5, "sábado": 5,
}

_NEGATIVE_DAY_CONTEXT: frozenset[str] = frozenset({
    "no puedo", "no me viene", "no me sirve", "imposible ese",
})

# Meses en español → número (para parsear fechas de slots ya presentados)
_MONTHS_ES_LOWER: dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
_SLOT_DATE_PATTERN = re.compile(r'\b(\d{1,2})\s+de\s+([a-záéíóú]+)\b', re.IGNORECASE)


def _wants_different_day(query: str) -> bool:
    """Detecta si el paciente quiere ver opciones de otro día/horario."""
    normalized = _normalize_text(query)
    return any(p in normalized for p in _OTHER_DAY_PATTERNS)


def _extract_last_shown_date(messages: list[BaseMessage]) -> datetime | None:
    """Busca en mensajes AI la fecha más tardía de slots ya presentados al paciente.

    Parsea el formato '10 de Abril', '13 de Abril', etc. que usa _format_display().
    Retorna la fecha más tardía encontrada, o None si no hay.
    """
    now = datetime.now(_TZ_ARGENTINA)
    last_date: datetime | None = None

    for msg in messages:
        if getattr(msg, "type", None) != "ai":
            continue
        for match in _SLOT_DATE_PATTERN.finditer(msg.content):
            day = int(match.group(1))
            month_name = match.group(2).lower()
            month_num = _MONTHS_ES_LOWER.get(month_name)
            if not month_num:
                continue
            year = now.year
            if month_num < now.month - 1:
                year += 1
            try:
                candidate = datetime(year, month_num, day, tzinfo=_TZ_ARGENTINA)
                if candidate.date() >= now.date():
                    if last_date is None or candidate > last_date:
                        last_date = candidate
            except ValueError:
                pass

    return last_date


def _extract_day_preference(messages: list[BaseMessage]) -> datetime | None:
    """Extrae la próxima ocurrencia del día de la semana mencionado por el paciente.

    Busca en mensajes humanos (más reciente primero). Ignora mensajes con contexto
    negativo ('no puedo el lunes'). Retorna None si no hay preferencia clara.
    Usa la fecha/hora local de Argentina para calcular correctamente "el próximo lunes".
    """
    now = datetime.now(_TZ_ARGENTINA)

    for msg in reversed(messages):
        if getattr(msg, "type", None) != "human":
            continue
        content = msg.content
        normalized = _normalize_text(content)

        if any(neg in normalized for neg in _NEGATIVE_DAY_CONTEXT):
            continue

        for day_name, weekday in _DAY_NAMES_TO_WEEKDAY.items():
            if day_name in normalized:
                days_ahead = (weekday - now.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7  # Hoy mismo → siguiente semana
                preferred = now + timedelta(days=days_ahead)
                # Retornar con tzinfo de Argentina para comparación coherente
                return preferred.replace(hour=0, minute=0, second=0, microsecond=0)

    return None


# ── Service alias map ────────────────────────────────────────────────────────
# Maps normalized alternative terms → normalized canonical term fragment.
# Applied to the query BEFORE standard prefix/substring matching so patients
# using colloquial or alternative names are correctly routed.
# Keyed by the alias (must be ≥4 chars after normalization to avoid false positives).
_SERVICE_ALIASES: dict[str, str] = {
    # Kinesiología aliases
    "kinesioterapia": "kinesiologia",
    "kinesiologo": "kinesiologia",
    "kinesiologos": "kinesiologia",
    "kinesio": "kinesiologia",
    # Fisioterapia aliases
    "fisioterapeuta": "fisioterapia",
    "fisioterapista": "fisioterapia",
    "fisio": "fisioterapia",
    # FKT (kinesiotherapy protocol abbreviation — maps to kinesiologia in ISADI context)
    "fkt": "kinesiologia",
    # Hidroterapia aliases
    "pileta": "hidroterapia",
    "piscina": "hidroterapia",
    "hidro": "hidroterapia",
    "hidroterapi": "hidroterapia",
    # Rehabilitación aliases
    "traumatologia": "rehabilitacion traumatologica",
    "traumatologica": "rehabilitacion traumatologica",
    "traumato": "rehabilitacion",
    "rehab": "rehabilitacion",
    # Plasma (PRP — Platelet Rich Plasma)
    "plaquetas": "plasma",
    "prp": "plasma",
    # Aquagym
    "agua gym": "aquagym",
    "gimnasio acuatico": "aquagym",
    "natacion": "aquagym",
    # Pilates variants
    "pilate": "pilates",
}


def _apply_service_aliases(normalized_query: str) -> str:
    """Replace alias terms with canonical terms in the normalized query.

    Applies longest aliases first to avoid partial substitutions
    (e.g. "rehabilitacion traumatologica" before "rehabilitacion").
    """
    for alias in sorted(_SERVICE_ALIASES, key=len, reverse=True):
        if alias in normalized_query:
            normalized_query = normalized_query.replace(alias, _SERVICE_ALIASES[alias])
    return normalized_query


def detect_service(query: str, services: list[Service]) -> Service | None:
    """Detecta qué servicio menciona el paciente en su mensaje.

    Estrategia:
        0. Alias expansion — traduce términos alternativos al nombre canónico.
        1. Match exacto del nombre del servicio normalizado.
        2. Match por substring (nombre del servicio contenido en el query).
        3. Match por palabra clave del nombre del servicio (primera palabra significativa).

    Retorna el primer servicio que matchea, o None si no hay coincidencia clara.
    """
    if not services:
        return None

    normalized_query = _apply_service_aliases(_normalize_text(query))

    for svc in services:
        svc_normalized = _normalize_text(svc.name)
        # Match exacto
        if svc_normalized in normalized_query:
            return svc

    # Match por primera palabra del nombre (ej: "kinesiología" matchea "quiero turno con kinesiólogo")
    for svc in services:
        svc_normalized = _normalize_text(svc.name)
        first_word = svc_normalized.split()[0] if svc_normalized.split() else svc_normalized
        if len(first_word) >= 4 and first_word in normalized_query:
            return svc

    # Match por prefijo: cada palabra del query contra el nombre completo del servicio
    # ej: "fisio" matchea "Fisioterapia", "kine" matchea "Kinesiología"
    query_words = normalized_query.split()
    for svc in services:
        svc_normalized = _normalize_text(svc.name)
        for word in query_words:
            if len(word) >= 4 and svc_normalized.startswith(word):
                return svc

    # Match por prefijo contra CADA PALABRA del nombre del servicio
    # ej: "traumatologia" matchea "Rehabilitación traumatológica" (segunda palabra)
    for svc in services:
        svc_words = _normalize_text(svc.name).split()
        for svc_word in svc_words:
            if len(svc_word) < 4:
                continue
            for query_word in query_words:
                if len(query_word) >= 4 and svc_word.startswith(query_word):
                    return svc

    return None


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


def _llm_has_scheduling_intent(messages: list[BaseMessage]) -> bool:
    """Clasifica intención de agendamiento usando el LLM con contexto conversacional completo.

    Retorna True si el paciente está intentando sacar un turno — considerando
    el historial completo, no solo el último mensaje. Fail-safe: retorna False ante errores.
    """
    try:
        system = SystemMessage(content=(
            "Sos un clasificador de intención. Respondé ÚNICAMENTE con 'SI' o 'NO', sin explicación.\n\n"
            "Pregunta: ¿En esta conversación el paciente está intentando sacar, reservar o "
            "preguntar por disponibilidad de un turno de atención médica o de salud?\n\n"
            "Considerá el contexto completo. Si el paciente responde a una oferta de turno "
            "diciendo para qué servicio o cuándo quiere, eso es intención de agendamiento."
        ))
        response = _classifier_llm.invoke([system] + list(messages))
        return "SI" in response.content.strip().upper()
    except Exception as exc:
        logger.warning("scheduling_node.llm_classifier_error", error=str(exc))
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

        # Detectar intención: determinista primero (sin costo), LLM como fallback con contexto
        messages = state.get("messages") or []
        has_intent = has_scheduling_intent(query) or _llm_has_scheduling_intent(messages)

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

        try:
            credentials_dict = resolve_calendar_credentials(
                tenant_config.calendar_credentials_ref,
                tenant_config.calendar_credentials,
            )
        except ValueError:
            credentials_dict = {}

        # v1.3: soporte multi-servicio
        svc = None  # se asigna en paths 2/3; None en path 1 (tenant sin servicios)
        services = tenant_service.get_tenant_services(tenant_id)

        if len(services) == 0:
            # Backwards compatible: tenant sin servicios → usar calendar_id del tenant
            calendar_id = tenant_config.calendar_id
            selected_service_id = None
            selected_service_name = None
            duration_minutes = settings.DEFAULT_SLOT_DURATION_MINUTES
        elif len(services) == 1:
            # Un solo servicio → seleccionar automáticamente
            svc = services[0]
            calendar_id = svc.calendar_id
            selected_service_id = str(svc.service_id)
            selected_service_name = svc.name
            duration_minutes = svc.duration_minutes
        else:
            # Múltiples servicios → intentar detectar del mensaje
            # Primero revisar si ya hay un servicio seleccionado en el estado
            existing_service_id = state.get("selected_service_id")
            if existing_service_id:
                svc = next((s for s in services if str(s.service_id) == existing_service_id), None)
            else:
                svc = detect_service(query, services)

            if svc is None:
                # No se detectó servicio → pedir al paciente que elija
                logger.info(
                    "scheduling_node.done",
                    tenant_id=tenant_id,
                    scheduling_intent=True,
                    service_selection_pending=True,
                    slots_count=0,
                    query_preview=query[:80],
                )
                return {
                    "scheduling_intent": True,
                    "service_selection_pending": True,
                    "available_slots": [],
                }

            calendar_id = svc.calendar_id
            selected_service_id = str(svc.service_id)
            selected_service_name = svc.name
            duration_minutes = svc.duration_minutes

        # Verificar reglas de booking del servicio antes de consultar el calendario
        if svc is not None:
            booking_mode: str = getattr(svc, "booking_mode", "appointment")

            if booking_mode == "walk_in":
                logger.info(
                    "scheduling_node.walk_in_service",
                    tenant_id=tenant_id,
                    service=svc.name,
                )
                result: dict = {
                    "scheduling_intent": False,
                    "walk_in_service": True,
                    "selected_service_name": selected_service_name,
                }
                if selected_service_id:
                    result["selected_service_id"] = selected_service_id
                return result

            elif booking_mode == "gated":
                normalized_q = _normalize_text(query)
                prerequisite_met = any(kw in normalized_q for kw in GATED_PREREQUISITE_MET_KEYWORDS)
                if not prerequisite_met:
                    prerequisite_note: str = getattr(svc, "prerequisite_note", None) or ""
                    logger.info(
                        "scheduling_node.gated_prerequisite_pending",
                        tenant_id=tenant_id,
                        service=svc.name,
                    )
                    result = {
                        "scheduling_intent": False,
                        "gated_service_active": True,
                        "gated_service_name": svc.name,
                        "gated_prerequisite_note": prerequisite_note,
                        "selected_service_name": selected_service_name,
                    }
                    if selected_service_id:
                        result["selected_service_id"] = selected_service_id
                    return result
                logger.info(
                    "scheduling_node.gated_prerequisite_met",
                    tenant_id=tenant_id,
                    service=svc.name,
                )

            elif booking_mode == "cycle":
                # Servicios por ciclo (Pilates, Aquagym): inscripción semanal fija.
                # El agente informa horarios/profesor/capacidad y deriva formalización a recepción.
                cycle_info_parts = []
                if getattr(svc, "professional_name", None):
                    cycle_info_parts.append(f"Profesional: {svc.professional_name}")
                if getattr(svc, "capacity_per_slot", None):
                    cycle_info_parts.append(f"Capacidad por clase: {svc.capacity_per_slot} personas")
                if getattr(svc, "reminder_instructions", None):
                    cycle_info_parts.append(f"Qué traer: {svc.reminder_instructions}")
                cycle_info = " | ".join(cycle_info_parts) if cycle_info_parts else ""
                logger.info(
                    "scheduling_node.cycle_service",
                    tenant_id=tenant_id,
                    service=svc.name,
                )
                result = {
                    "scheduling_intent": False,
                    "cycle_service_active": True,
                    "cycle_service_name": svc.name,
                    "cycle_service_info": cycle_info,
                    "selected_service_name": selected_service_name,
                }
                if selected_service_id:
                    result["selected_service_id"] = selected_service_id
                return result

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

        # Detectar preferencia de fecha del paciente para evitar mostrar siempre
        # los slots más próximos ignorando lo que el paciente pidió.
        start_date: datetime | None = None
        if _wants_different_day(query):
            # El paciente quiere ver otro día → saltar las fechas ya presentadas
            last_shown = _extract_last_shown_date(messages)
            if last_shown:
                start_date = last_shown + timedelta(days=1)
                logger.info(
                    "scheduling_node.date_skip",
                    reason="wants_different_day",
                    start_date=start_date.isoformat(),
                )
        else:
            # El paciente mencionó un día de la semana → buscar desde ese día
            start_date = _extract_day_preference(messages)
            if start_date:
                logger.info(
                    "scheduling_node.date_preference",
                    start_date=start_date.isoformat(),
                )

        slots = calendar_service.get_available_slots(
            calendar_id=calendar_id,
            credentials_dict=credentials_dict,
            duration_minutes=duration_minutes,
            lookahead_hours=settings.SCHEDULING_LOOKAHEAD_HOURS,
            start_date=start_date,
        )

    except Exception as exc:
        logger.error("scheduling_node.error", tenant_id=tenant_id, error=str(exc))
        return {"scheduling_intent": False}

    logger.info(
        "scheduling_node.done",
        tenant_id=tenant_id,
        scheduling_intent=True,
        slots_count=len(slots),
        selected_service=selected_service_name,
        query_preview=query[:80],
    )
    result: dict = {"scheduling_intent": True, "available_slots": slots}
    if selected_service_id is not None:
        result["selected_service_id"] = selected_service_id
    if selected_service_name is not None:
        result["selected_service_name"] = selected_service_name
    return result

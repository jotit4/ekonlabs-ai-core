"""Nodo: generar respuesta IA con contexto RAG + System Prompt del Tenant."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

_TZ_ARG = ZoneInfo("America/Argentina/Buenos_Aires")

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from app.agent.tools.search_tool import make_search_tool
from langchain_openai import ChatOpenAI

from app.agent.guardrails.input_sanitizer import sanitize_user_input
from app.agent.state import ConversationState
from app.core.logging import get_logger
from app.services import booking_draft_service, calendar_service, patient_service, tenant_service
from app.services.vault_client import resolve_calendar_credentials

logger = get_logger(__name__)

DEFAULT_SYSTEM_PROMPT = """
<identidad>
Sos una recepcionista virtual con IA para clínicas de salud.
Tu única función es gestionar turnos y responder preguntas sobre la clínica.

No sos médico, no sos asesor, no sos asistente general. Sos una recepcionista.

Si el paciente pregunta si sos una persona o una IA:
→ "Soy una asistente virtual de la clínica."
No lo digas proactivamente. Esperá a que pregunten.
</identidad>

<tono>
- Siempre en voseo argentino. Nunca "tú", nunca "usted", nunca conjugaciones peninsulares.
- Cercano, cálido y directo. Como una recepcionista real que habla por WhatsApp.
- Respuestas cortas: máximo 3-4 líneas salvo que el contexto lo requiera.
- Una sola pregunta por mensaje. Si necesitás varios datos, pedí uno a la vez.
- Sin lenguaje técnico ni jerga médica.
- Emojis: solo en confirmaciones de turno y mensajes de cierre. Máximo 1 por mensaje.
</tono>

<fuentes_de_verdad>
Solo existen estas tres fuentes de información para vos:
1. Las instrucciones explícitas de este prompt.
2. Lo que devuelva search_knowledge_tool.
3. Lo que el paciente dijo explícitamente en esta conversación.

Cualquier otro conocimiento — precios, horarios, profesionales, servicios, diagnósticos,
tratamientos — no existe para vos. No lo uses.
</fuentes_de_verdad>

<puede_hacer>
Solo podés hacer estas tres cosas:
1. Mostrar turnos disponibles y coordinar su reserva.
2. Cancelar un turno existente del paciente.
3. Responder preguntas sobre la clínica usando search_knowledge_tool.
</puede_hacer>

<no_puede_hacer>
Lo siguiente no existe para vos. Si el paciente lo pide, respondé como se indica:

DAR DIAGNÓSTICOS, RECETAS O CONSEJOS MÉDICOS
→ "Eso lo tiene que evaluar el profesional en consulta. ¿Querés que te busque un turno?"

CONSULTAR HISTORIAL CLÍNICO DEL PACIENTE
→ "No tengo acceso a historiales médicos."

PROMETER QUE ALGUIEN VA A LLAMAR O ESCRIBIR AL PACIENTE
→ Nunca digas "te van a llamar", "te contactamos" ni "te mandamos un mail". No existe esa función.

CONFIRMAR INFORMACIÓN QUE search_knowledge_tool NO DEVOLVIÓ
→ "No tengo ese dato. Te recomiendo llamar directamente a la clínica."

DAR INFORMACIÓN SIN CONSULTAR search_knowledge_tool PRIMERO
→ Ante cualquier pregunta sobre precios, horarios de atención, servicios, especialidades
  o profesionales: siempre consultá search_knowledge_tool antes de responder.

CREAR O CANCELAR UN TURNO SIN CONFIRMACIÓN EXPLÍCITA
→ Siempre mostrá los datos y esperá que el paciente confirme antes de actuar.
</no_puede_hacer>

<protocolo_turnos>
PARA AGENDAR — seguí este orden exacto:

Paso 1. El sistema te provee los turnos disponibles. Presentalos en formato numerado con emojis.
  - Máximo 3 opciones.
  - Incluí el texto de cada turno exactamente como aparece. No lo reformatees ni parafrasees.
  - Usá siempre este formato exacto:

  "Encontré estos turnos disponibles para vos:

  1️⃣ [turno 1]
  2️⃣ [turno 2]
  3️⃣ [turno 3]

  ¿Cuál te viene mejor? Podés elegir el número o decirme si preferís otro horario."

Paso 2. Esperá que el paciente elija. No confirmes ni reserves hasta que elija.

Paso 3. Pedí su nombre completo para registrar el turno.
  → "¿Me das tu nombre completo para anotarte?"

Paso 4. Con el nombre anotado, pedí su número de DNI (documento nacional de identidad).
  → "¿Me das tu DNI? Si no lo tenés a mano podés seguir igual."
  Si el paciente no lo da tras 2 intentos, continuá igual sin DNI.

Paso 5. El sistema confirma la reserva. Comunicalo con calidez e incluí los datos exactos del turno.

---

PARA CANCELAR:
1. Encontrá el turno del paciente.
2. Mostrá los datos y pedí confirmación: "Encontré tu turno para [datos]. ¿Confirmás la cancelación?"
3. Solo después de confirmación explícita procedé.

---

SI NO HAY TURNOS DISPONIBLES:
→ "Por el momento no hay turnos disponibles. Te recomiendo llamar directamente a la clínica."
No inventes fechas. No prometas disponibilidad futura.
</protocolo_turnos>

<alucinaciones_prohibidas>
Casos concretos donde está prohibido inventar:

- Paciente dice "mañana" o "el martes"
  → NO asumas una fecha. Los turnos disponibles los provee el sistema, no vos.

- Paciente dice "¿tienen turno a las 10?"
  → NO confirmes ese horario. Solo son válidos los turnos que el sistema te mostró.

- Paciente pregunta el precio de algo
  → NO estimes ni aproximes. Consultá search_knowledge_tool primero.

- Paciente pregunta por un profesional específico
  → NO confirmes ni niegues sin search_knowledge_tool.

- search_knowledge_tool no devuelve resultados relevantes
  → NO inventes. Respondé: "No tengo ese dato. Te recomiendo llamar directamente a la clínica."

- El turno fue presentado pero el paciente no confirmó
  → NO digas "quedó reservado". El turno no existe hasta que el sistema lo confirme.
</alucinaciones_prohibidas>

<palabras_confirmacion>
Una respuesta del paciente es AFIRMATIVA si contiene alguna de estas palabras
(tolerante a tildes, mayúsculas y letras repetidas como "siii", "okkk"):

  dale, listo, va, sí, si, sep, ok, okay, okey, perfecto, bárbaro, barbaro,
  confirmo, confirmado, anotame, poneme, agendame, ese me viene, quiero ese,
  me quedo con ese, adelante, bueno, está bien, esta bien

Una respuesta es NEGATIVA si contiene:
  no, nop, nel, espera, esperá, momento, aguantá, cambio, otro, otra

Una respuesta es CORRECTIVA si contiene afirmativo + corrección:
  "sí pero a las 15:00", "dale pero el miércoles", "ok somos 3 no 2"
  → Actualizá solo el dato corregido. Mantené todo lo demás. Mostrá el resumen actualizado.

Si no queda claro: "¿Confirmo el turno?"
</palabras_confirmacion>

<persistencia_de_datos>
Si el paciente corrige un solo dato, mantené en memoria todos los demás.
No reinicies la conversación. No volvás a pedir lo que ya tenés.

CORRECTO:
  Paciente ya eligió el turno del martes → da su nombre → registrás el turno del martes con ese nombre.
INCORRECTO:
  Paciente da su nombre → volvés a preguntar qué turno quiere.
</persistencia_de_datos>

<cambio_de_intencion>
Si el paciente estaba en el medio de un flujo (eligiendo turno, dando su nombre)
y de repente pregunta algo diferente (precio, horario, servicios):
→ Respondé la pregunta brevemente usando search_knowledge_tool.
→ Luego retomá el flujo donde estaba: "¿Seguimos con el turno?"

No abandones el flujo activo salvo que el paciente lo indique explícitamente.
</cambio_de_intencion>

<escalada_humana>
Si el sistema indica que el caso debe ser atendido por una persona, comunicalo con naturalidad:
→ "Te paso con alguien de nuestro equipo que te puede ayudar mejor. 😊"
No expliques motivos técnicos. No menciones el sistema.
</escalada_humana>

<reglas_de_output>
Tu razonamiento interno es silencioso. Nunca lo verbalices.

PROHIBIDO:
- Mostrar "Paso 1:", "Paso 2:", etc. al paciente.
- Decir "voy a consultar la base de conocimientos..." o similares.
- Mencionar herramientas, sistemas, nodos o procesos internos.
- Explicar por qué hacés algo.
- Frases de espera: "Un momento...", "Dame un segundo...", "Ahora te busco...", "Espera que...",
  "Enseguida te digo..." o cualquier frase que implique que el agente está procesando algo.
  El agente siempre responde con información concreta o una pregunta directa. Nunca con una promesa de respuesta futura.

CORRECTO:
  Respuesta directa y natural, como si fuera una recepcionista hablando por WhatsApp.

INCORRECTO:
  Paciente: "quiero un turno"
  Agente:   "Paso 1: Verificando disponibilidad. Consultando sistema... Encontré opciones."

CORRECTO:
  Paciente: "quiero un turno"
  Agente:   "¡Hola! Claro, te busco algo ahora. ¿Tenés alguna fecha en mente?"
</reglas_de_output>
"""

EMPATHY_MODIFIER = (
    "IMPORTANTE — MODO URGENCIA ACTIVADO: El paciente está experimentando dolor "
    "o angustia. Responde con MAXIMA empatia: valida su dolor explicitamente, "
    "muéstrate disponible de inmediato, y prioriza ofrecer la cita mas urgente "
    "posible. Usa un tono calido, tranquilizador y humano. No minimices su malestar."
)

ANTI_DIAGNOSTIC_RESPONSE = (
    "Entiendo tu consulta, pero te soy sincero: "
    "no estoy habilitado para dar diagnósticos, recetas ni consejos médicos. "
    "Eso requiere la evaluación presencial de un profesional de la salud. "
    "Lo que sí puedo hacer es ayudarte a agendar una cita con el médico "
    "lo antes posible. ¿Te gustaría que busquemos un turno disponible para hoy o mañana?"
)

SCHEDULING_NO_SLOTS_RESPONSE = (
    "Por el momento no encuentro turnos disponibles en los próximos días. "
    "Te recomiendo que llames directamente a la clínica o intentá consultar más tarde. 🙏"
)

BOOKING_CONFIRMED_TEMPLATE = (
    "¡Perfecto! Tu turno fue reservado exitosamente:\n\n"
    "📅 {display}\n\n"
    "Te esperamos. Si necesitás cancelar o reprogramar, avisame por acá. 😊"
)

BOOKING_FAILED_NO_SLOTS = (
    "Lo siento, no pude confirmar el turno porque ya no hay disponibilidad en ese horario. "
    "¿Querés que te busque otras opciones?"
)

BOOKING_CANCELLED = (
    "Tu turno fue cancelado exitosamente. "
    "Si en algún momento querés reagendar, estoy acá para ayudarte. 😊"
)

BOOKING_NOT_FOUND = (
    "No encontré un turno reservado a tu nombre para cancelar. "
    "Si creés que hay un error, te recomiendo llamar directamente a la clínica."
)

SHADOW_MODE_REDIRECT_RESPONSE = (
    "Por el momento la gestión de turnos está siendo atendida directamente por nuestro equipo. "
    "Por favor, comunicate con la clínica por teléfono o de forma presencial para coordinar tu cita. "
    "¡Quedamos a tu disposición para cualquier otra consulta!"
)

LOW_CONFIDENCE_PAUSE_RESPONSE = (
    "No tengo información suficiente para responder tu consulta. "
    "Te recomendamos llamar directamente a la clínica para que puedan ayudarte. 🙏"
)

DEFAULT_CONFIDENCE_THRESHOLD: float = 0.5


def _build_messages_for_llm(system_content: str, state: ConversationState) -> list:
    """Build the message list for an LLM call with injection-safe user content.

    All HumanMessage content is passed through the input sanitizer before
    reaching the model. Non-human messages (AI, System, Tool) are forwarded as-is.
    """
    sanitized = []
    for msg in state["messages"]:
        if isinstance(msg, HumanMessage) and isinstance(msg.content, str):
            sanitized.append(HumanMessage(content=sanitize_user_input(msg.content)))
        else:
            sanitized.append(msg)
    return [SystemMessage(content=system_content)] + sanitized


_DAYS_ES_GEN = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}


def _build_system_prompt(state: ConversationState) -> str:
    """Ensambla el system prompt final: DEFAULT + contexto del tenant (aditivo, no reemplazo).

    state["system_prompt"] contiene el system_prompt_override del tenant desde Supabase.
    Si existe, se añade al DEFAULT como <contexto_clinica> — nunca lo reemplaza.
    Esto garantiza que las reglas genéricas del agente siempre estén presentes.
    """
    now = datetime.now(_TZ_ARG)
    date_line = (
        f"Fecha y hora actual (Argentina): {_DAYS_ES_GEN[now.weekday()]} "
        f"{now.day:02d}/{now.month:02d}/{now.year} a las {now.strftime('%H:%M')} hs\n\n"
    )
    first_contact_hint = (
        "PRIMER CONTACTO — El paciente se comunica por primera vez. "
        "Empezá tu respuesta con un saludo cálido brevísimo (ej: '¡Hola! ' o '¡Hola! 😊 ') "
        "antes de responder su consulta. Máximo 3 palabras de saludo.\n\n"
        if state.get("is_first_contact", False) else ""
    )
    tenant_context = state.get("system_prompt") or ""
    base = date_line + first_contact_hint + DEFAULT_SYSTEM_PROMPT
    if tenant_context:
        return base + "\n\n<contexto_clinica>\n" + tenant_context + "\n</contexto_clinica>"
    return base


def _extract_patient_name(text: str) -> str | None:
    """Extract patient name from message using prefix-stripping heuristic.

    Strips common Argentine Spanish name-introduction phrases and affirmative
    openers, then validates the remainder looks like a name (2–6 words, no digits,
    all Unicode letters/hyphens/dots). Returns name with original casing, or None.
    """
    cleaned = text.strip()
    # Strip leading punctuation like "¡" or "¿"
    cleaned = re.sub(r'^[^\w\s]+', '', cleaned).strip()
    # Strip trailing non-word characters (punctuation, emojis, etc.)
    cleaned = re.sub(r'[^\w\s]+$', '', cleaned).strip()

    # Ordered prefix list — compound forms first to handle "sí, me llamo Juan"
    # in a single pass without needing to re-check after partial stripping.
    _NAME_PREFIXES = (
        "sí, me llamo ", "si, me llamo ", "bueno, me llamo ", "claro, me llamo ",
        "dale, me llamo ", "hola, me llamo ", "hola, soy ",
        "sí, soy ", "si, soy ", "bueno, soy ", "claro, soy ", "dale, soy ",
        "sí me llamo ", "si me llamo ", "bueno me llamo ", "claro me llamo ",
        "dale me llamo ",
        "sí soy ", "si soy ", "bueno soy ", "claro soy ", "dale soy ",
        "me llamo ", "soy ", "mi nombre es ", "mi nombre: ", "nombre: ",
        "me dicen ", "me llaman ",
        "sí, ", "si, ", "claro, ", "dale, ", "bueno, ", "ok, ", "okay, ",
        "hola, ", "buenas, ",
    )

    # Two-pass stripping: handles chains like "sí, me llamo Juan" in pass 1
    # or "claro, me llamo Juan" where compound prefix covers both tokens at once.
    for _ in range(2):
        prev = cleaned
        lower = cleaned.lower()
        for prefix in _NAME_PREFIXES:
            if lower.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
                # Strip trailing non-word chars again after prefix removal
                cleaned = re.sub(r'[^\w\s]+$', '', cleaned).strip()
                break
        if cleaned == prev:
            break

    words = cleaned.split()
    if not (2 <= len(words) <= 6):  # Extended from 2–4 to support compound surnames
        return None
    if any(c.isdigit() for c in cleaned):
        return None
    if not re.match(r"^[\w\s\-\.\']+$", cleaned, re.UNICODE):
        return None
    return cleaned


def _extract_dni(text: str) -> str | None:
    """Extrae DNI argentino de un mensaje de WhatsApp.

    Acepta formatos: "32456789", "32.456.789", "mi DNI es 32456789", "documento: 12345678".
    Retorna el DNI como string de 7-8 dígitos sin puntos, o None si no hay match válido.
    """
    cleaned = text.strip().lower()
    for prefix in (
        "mi dni es ",
        "mi dni:",
        "dni es ",
        "dni: ",
        "dni ",
        "documento nacional ",
        "documento: ",
        "documento ",
        "es el ",
        "es ",
        "mi documento es ",
    ):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
            break
    # Eliminar puntos separadores de miles ("32.456.789" → "32456789")
    cleaned = cleaned.replace(".", "").replace(" ", "")
    if re.match(r"^\d{7,8}$", cleaned):
        return cleaned
    return None


def _is_slot_expired(state: ConversationState) -> bool:
    """Return True if >30 minutes have passed since slot_presented_at (NAME-07)."""
    slot_presented_at = state.get("slot_presented_at")
    if not slot_presented_at:
        return False
    try:
        presented = datetime.fromisoformat(slot_presented_at)
        if presented.tzinfo is None:
            presented = presented.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - presented) > timedelta(minutes=30)
    except (ValueError, TypeError):
        return False


def _finalize_registration(
    state: ConversationState,
    tenant_id: str,
    patient_name: str,
    dni: str | None,
) -> dict:
    """Phase C: create patient record in DB, calendar event, appointment record.

    Called after both name and DNI have been collected (or DNI skipped after 2 attempts).
    Raises on calendar failure (caller's try/except wraps this call from _handle_registration).
    Appointment creation failure is non-fatal (calendar event already created).
    """
    phone_number = state["phone_number"]
    service_name = state.get("selected_service_name")
    selected_service_id = state.get("selected_service_id")
    booked_slot: dict = state.get("booked_slot") or {}
    system_prompt_base = _build_system_prompt(state)

    tenant_config = tenant_service.get_tenant_config(tenant_id)
    try:
        creds = resolve_calendar_credentials(
            tenant_config.calendar_credentials_ref,
            tenant_config.calendar_credentials,
        )
    except ValueError:
        creds = {}

    # v1.3: usar calendar_id del servicio si está disponible
    if selected_service_id:
        services = tenant_service.get_tenant_services(tenant_id)
        svc = next((s for s in services if str(s.service_id) == selected_service_id), None)
        cal_id = svc.calendar_id if svc else tenant_config.calendar_id
    else:
        cal_id = tenant_config.calendar_id

    # v1.4: crear o actualizar ficha del paciente (incluye datos extendidos F-ISADI-3)
    patient = patient_service.get_or_create_patient(
        tenant_id=tenant_id,
        phone_number=phone_number,
        full_name=patient_name,
        dni=dni,
        obra_social=state.get("patient_obra_social"),
        obra_social_number=state.get("patient_obra_social_number"),
        reason_for_visit=state.get("patient_motivo"),
        alternative_phone=state.get("patient_alt_phone"),
        address=state.get("patient_address"),
    )

    # Crear evento en Google Calendar o en calendario nativo (Supabase)
    event_title = f"{service_name} — {patient_name}" if service_name else f"Turno — {patient_name}"
    uses_native = getattr(tenant_config, "uses_native_calendar", False)

    if uses_native:
        # Nativo: sin GCal — el appointment en Supabase ES el evento
        from app.services import availability_service as _avail_svc
        prof_id = _avail_svc.resolve_professional_id(selected_service_id)
        try:
            patient_service.create_appointment(
                tenant_id=tenant_id,
                patient_id=patient.patient_id,
                service_id=selected_service_id,
                calendar_event_id=None,
                start_iso=booked_slot["start"],
                end_iso=booked_slot["end"],
                professional_id=prof_id,
            )
        except Exception as appt_exc:
            logger.error(
                "generation_node.native_appointment_error",
                tenant_id=tenant_id,
                error=str(appt_exc),
            )
        event_id = None
    else:
        # Legacy: GCal como fuente de verdad
        event_id = calendar_service.create_event(
            calendar_id=cal_id,
            credentials_dict=creds,
            start_iso=booked_slot["start"],
            end_iso=booked_slot["end"],
            phone_number=phone_number,
            title=event_title,
        )
        try:
            patient_service.create_appointment(
                tenant_id=tenant_id,
                patient_id=patient.patient_id,
                service_id=selected_service_id,
                calendar_event_id=event_id,
                start_iso=booked_slot["start"],
                end_iso=booked_slot["end"],
            )
        except Exception as appt_exc:
            logger.error(
                "generation_node.registration_appointment_error",
                tenant_id=tenant_id,
                error=str(appt_exc),
            )

    # INFRA-06: registration complete — delete Redis draft
    booking_draft_service.delete_draft(tenant_id, phone_number)

    display = booked_slot.get("display", "")
    system_content = (
        f"{system_prompt_base}\n\n"
        "ACCIÓN REQUERIDA — TURNO CONFIRMADO CON NOMBRE\n"
        f"El turno fue reservado a nombre de {patient_name}. "
        "Incluí el siguiente texto de turno en tu respuesta exactamente como aparece:\n\n"
        f"{display}\n\n"
        "Dirigite al paciente por su nombre. Usá voseo argentino cálido."
    )
    messages_for_llm = _build_messages_for_llm(system_content, state)
    response = _get_llm().invoke(messages_for_llm)
    logger.info(
        "generation_node.done",
        tenant_id=tenant_id,
        response_type="registration_complete",
        has_dni=bool(dni),
    )
    return {
        "messages": [response],
        "patient_name": patient_name,
        "patient_dni": dni,
        "patient_id": patient.patient_id,
        "name_collection_active": False,
        "dni_collection_active": False,
        "calendar_event_id": event_id,
    }


def _extract_extended_data(text: str) -> dict:
    """Parse extended patient data from free text using LLM.

    Returns dict with state-keyed fields (patient_obra_social, etc.).
    Empty dict if extraction fails or nothing is found.
    """
    if not text or not text.strip():
        return {}
    try:
        prompt = (
            "Extraé los siguientes datos del mensaje de un paciente. "
            "Devolvé SOLO un objeto JSON con estos campos exactos (null si no se menciona el dato):\n"
            '- "obra_social": nombre de la obra social, o "particular" si paga sin cobertura, o null\n'
            '- "obra_social_number": número de afiliado/socio (solo si tiene OS), o null\n'
            '- "reason_for_visit": motivo de consulta o diagnóstico mencionado, o null\n'
            '- "alternative_phone": número de teléfono alternativo, o null\n'
            '- "address": dirección del paciente, o null\n\n'
            f'Mensaje: "{text}"\n\n'
            "Devolvé solo el JSON."
        )
        response = _get_llm().invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = json.loads(raw)
        mapping = {
            "obra_social": "patient_obra_social",
            "obra_social_number": "patient_obra_social_number",
            "reason_for_visit": "patient_motivo",
            "alternative_phone": "patient_alt_phone",
            "address": "patient_address",
        }
        return {mapping[k]: v for k, v in data.items() if k in mapping and v is not None}
    except Exception as exc:
        logger.warning("generation_node.extended_extraction_failed", error=str(exc))
        return {}


def _handle_registration(state: ConversationState, tenant_id: str) -> dict:
    """Gestiona la recolección de datos del paciente: nombre (Fase A) → DNI (Fase B) → evento (Fase C).

    Fase A — Nombre:
        Turn 1 (name_attempts == 0): Pedir nombre, setear name_attempts=1.
        Turn 2+ (name_attempts >= 1): Intentar extraer nombre del último mensaje.
          - Nombre encontrado → activar Fase B (pedir DNI).
          - Sin nombre tras 2 intentos → is_paused=True (handoff humano).

    Fase B — DNI:
        Turn 1 (dni_attempts == 0): Pedir DNI, setear dni_attempts=1.
        Turn 2+ (dni_attempts >= 1): Intentar extraer DNI del último mensaje.
          - DNI encontrado → Fase C.
          - Sin DNI tras 2 intentos → Fase C sin DNI (no bloquea el turno).

    Fase C — Finalización: crear ficha + evento en Calendar + appointment en DB.

    Slot expirado (NAME-07): informar al paciente, limpiar flags.
    """
    system_prompt_base: str = _build_system_prompt(state)

    # NAME-07: slot expiry check
    if _is_slot_expired(state):
        system_content = (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — TURNO EXPIRADO\n"
            "El turno que el paciente había seleccionado expiró (pasaron más de 30 minutos). "
            "Informá al paciente con calidez y ofrecé buscar nuevas opciones. "
            "Usá voseo argentino."
        )
        messages_for_llm = _build_messages_for_llm(system_content, state)
        response = _get_llm().invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="registration_slot_expired",
        )
        return {
            "messages": [response],
            "name_collection_active": False,
            "dni_collection_active": False,
            "booking_intent": False,
        }

    patient_name: str | None = state.get("patient_name")
    booked_slot: dict = state.get("booked_slot") or {}

    def _transition_to_phase_d(captured_dni: str | None) -> dict:
        """Persist DNI and start Phase D (extended data collection)."""
        booking_draft_service.update_draft(tenant_id, state["phone_number"], {
            "patient_dni": captured_dni,
            "dni_collection_active": False,
            "extended_collection_active": True,
            "extended_attempts": 0,
        })
        slot_display = booked_slot.get("display", "")
        system_content = (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SOLICITAR DATOS ADICIONALES DEL PACIENTE\n"
            f"Ya tenés el nombre ({patient_name}) y DNI del paciente para el turno:\n{slot_display}\n\n"
            "Pedile los siguientes datos adicionales, todos en un solo mensaje amistoso:\n"
            "1. ¿Tenés obra social o pagás particular? (si tiene OS: nombre y número de afiliado)\n"
            "2. Motivo de la consulta o diagnóstico\n"
            "3. Teléfono alternativo de contacto (opcional)\n"
            "4. Dirección (opcional)\n\n"
            "Aclará que los datos opcionales pueden saltearlos. Usá voseo argentino, tono cálido y conciso."
        )
        messages_for_llm = _build_messages_for_llm(system_content, state)
        response = _get_llm().invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="registration_ask_extended",
        )
        return {
            "messages": [response],
            "patient_dni": captured_dni,
            "dni_collection_active": False,
            "extended_collection_active": True,
            "extended_attempts": 0,
        }

    # ── Fase D: colección de datos extendidos (OS, motivo, tel alt, dirección) ──
    if patient_name and state.get("extended_collection_active"):
        extended_attempts: int = state.get("extended_attempts") or 0

        if extended_attempts >= 1:
            messages = state.get("messages") or []
            last_human_text = ""
            for msg in reversed(messages):
                if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                    last_human_text = msg.content
                    break

            extracted = _extract_extended_data(last_human_text)
            if extracted or extended_attempts >= 2:
                # Datos capturados (o tiempo agotado) → Fase C con datos extendidos
                booking_draft_service.update_draft(tenant_id, state["phone_number"], {
                    "extended_collection_active": False,
                    **extracted,
                })
                merged_state = {**state, **extracted}
                patient_dni = merged_state.get("patient_dni")
                try:
                    return _finalize_registration(merged_state, tenant_id, patient_name, patient_dni)
                except Exception as exc:
                    logger.error("generation_node.registration_error", tenant_id=tenant_id, error=str(exc))
                    raise

        # Pedir datos extendidos (2° intento si no se pudo parsear)
        booking_draft_service.update_draft(tenant_id, state["phone_number"], {
            "extended_attempts": extended_attempts + 1,
        })
        slot_display = booked_slot.get("display", "")
        system_content = (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — RE-SOLICITAR DATOS ADICIONALES DEL PACIENTE\n"
            f"Todavía necesitás datos de {patient_name} para completar el registro del turno:\n{slot_display}\n\n"
            "Pedile nuevamente de forma clara: obra social (o particular), motivo de la consulta, "
            "teléfono alternativo (opcional) y dirección (opcional). "
            "Podés pedírselos todos en un solo mensaje. Usá voseo argentino."
        )
        messages_for_llm = _build_messages_for_llm(system_content, state)
        response = _get_llm().invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="registration_ask_extended_retry",
            extended_attempts=extended_attempts,
        )
        return {
            "messages": [response],
            "extended_attempts": extended_attempts + 1,
        }

    # ── Fase B: colección de DNI (nombre ya en state) ─────────────────────────
    if patient_name and state.get("dni_collection_active") and not state.get("patient_dni"):
        dni_attempts: int = state.get("dni_attempts") or 0

        if dni_attempts >= 1:
            messages = state.get("messages") or []
            last_human_text = ""
            for msg in reversed(messages):
                if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                    last_human_text = msg.content
                    break

            extracted_dni = _extract_dni(last_human_text)

            if extracted_dni:
                # DNI encontrado → Fase C directamente (sin Phase D para evitar alucinaciones del LLM)
                booking_draft_service.update_draft(tenant_id, state["phone_number"], {
                    "patient_dni": extracted_dni,
                    "dni_collection_active": False,
                })
                merged_state = {**state, "patient_dni": extracted_dni}
                return _finalize_registration(merged_state, tenant_id, patient_name, extracted_dni)

            # Sin DNI tras 2 intentos → Fase C sin DNI (no bloquea el turno)
            if dni_attempts >= 2:
                logger.info("generation_node.registration_dni_skipped", tenant_id=tenant_id)
                return _finalize_registration(state, tenant_id, patient_name, None)

        # Pedir DNI (Turn 1, o re-preguntar)
        # INFRA-06: update draft with incremented dni_attempts so next turn knows to extract
        booking_draft_service.update_draft(tenant_id, state["phone_number"], {
            "dni_attempts": dni_attempts + 1,
        })
        slot_display = booked_slot.get("display", "")
        system_content = (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SOLICITAR DNI DEL PACIENTE\n"
            f"El paciente ({patient_name}) eligió el turno:\n\n"
            f"{slot_display}\n\n"
            "Pedile su número de DNI (documento nacional de identidad) para terminar de registrar el turno. "
            "Si no lo tiene a mano, decile que puede continuar sin él. "
            "Pedíselo de forma natural y breve en voseo argentino."
        )
        messages_for_llm = _build_messages_for_llm(system_content, state)
        response = _get_llm().invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="registration_dni_ask",
            dni_attempts=dni_attempts,
        )
        return {
            "messages": [response],
            "dni_attempts": dni_attempts + 1,
        }

    # ── Fase A: colección de nombre ────────────────────────────────────────────
    name_attempts: int = state.get("name_attempts") or 0

    if name_attempts >= 1:
        messages = state.get("messages") or []
        last_human_text = ""
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                last_human_text = msg.content
                break

        extracted_name = _extract_patient_name(last_human_text)

        if extracted_name:
            # Nombre encontrado → activar Fase B, pedir DNI.
            # dni_attempts=1: el LLM pide el DNI en ESTA respuesta, así que el
            # próximo turno ya cuenta como intento 1 y extrae directamente.
            # (Si fuera 0, _handle_registration vería "no pregunté aún" y pediría DNI de nuevo.)
            booking_draft_service.update_draft(tenant_id, state["phone_number"], {
                "patient_name": extracted_name,
                "name_collection_active": False,
                "dni_collection_active": True,
                "dni_attempts": 1,
            })
            system_content = (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — PEDIR DNI\n"
                f"El paciente te dijo que se llama {extracted_name}. Anotaste su nombre.\n"
                "Tu único objetivo ahora es pedirle su número de DNI (documento nacional de identidad). "
                "NO menciones el turno ni preguntes si confirma. Solo pedí el DNI. "
                "Aclará que si no lo tiene a mano puede seguir sin él. "
                "Una sola oración, voseo argentino."
            )
            messages_for_llm = _build_messages_for_llm(system_content, state)
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="registration_name_captured_ask_dni",
            )
            return {
                "messages": [response],
                "patient_name": extracted_name,
                "name_collection_active": False,
                "dni_collection_active": True,
                "dni_attempts": 1,
            }

        # NAME-05: sin nombre tras 2 intentos → handoff humano
        if name_attempts >= 2:
            system_content = (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — DERIVAR A RECEPCIÓN HUMANA\n"
                "El paciente no pudo proporcionar su nombre después de dos intentos. "
                "Informá con calidez que lo va a atender un miembro del equipo. "
                "Usá voseo argentino."
            )
            messages_for_llm = _build_messages_for_llm(system_content, state)
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="registration_name_handoff",
            )
            return {
                "messages": [response],
                "is_paused": True,
                "name_collection_active": False,
            }

    # Pedir nombre (Turn 1, o re-preguntar)
    # INFRA-06: update draft with incremented name_attempts so next turn knows to extract
    booking_draft_service.update_draft(tenant_id, state["phone_number"], {
        "name_attempts": name_attempts + 1,
    })
    slot_display = booked_slot.get("display", "")
    system_content = (
        f"{system_prompt_base}\n\n"
        "ACCIÓN REQUERIDA — SOLICITAR NOMBRE DEL PACIENTE\n"
        "El paciente seleccionó el siguiente turno:\n\n"
        f"{slot_display}\n\n"
        "Antes de confirmar, necesitás su nombre completo (nombre y apellido) para registrar "
        "el turno en el sistema. Pedíselo de forma amable y natural en voseo argentino."
    )
    messages_for_llm = _build_messages_for_llm(system_content, state)
    response = _get_llm().invoke(messages_for_llm)
    logger.info(
        "generation_node.done",
        tenant_id=tenant_id,
        response_type="registration_name_ask",
        name_attempts=name_attempts,
    )
    return {
        "messages": [response],
        "name_attempts": name_attempts + 1,
    }


# Lazy singleton — created on first use so LangSmith env vars (set in lifespan/worker.py)
# are already in os.environ when ChatOpenAI registers its tracer.
# Tests must patch at: app.agent.nodes.generation._llm
_llm: ChatOpenAI | None = None


def _get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0, request_timeout=20)
    return _llm


def _build_gated_context(state: ConversationState, system_prompt_base: str) -> str:
    """Build system content for gated-service LLM call (prerequisite consultation required)."""
    service_name = state.get("gated_service_name") or "este servicio"
    prerequisite_note = state.get("gated_prerequisite_note") or (
        f"Para acceder a {service_name}, primero debés tener una consulta médica previa "
        "con el profesional correspondiente, quien evaluará si el servicio es adecuado para vos."
    )
    return (
        f"{system_prompt_base}\n\n"
        "ACCIÓN REQUERIDA — SERVICIO CON CONSULTA PREVIA OBLIGATORIA\n"
        f"El paciente pregunta por {service_name}. "
        "Este servicio no se puede reservar sin una consulta médica previa. "
        f"Requisito:\n\n{prerequisite_note}\n\n"
        "Comunicalo claramente en voseo argentino, con calidez. "
        "Preguntá si ya tuvo esa consulta previa. "
        "Si dice que sí y menciona lo que le indicaron, podés continuar con el turno en el próximo mensaje."
    )


def _build_cycle_context(state: ConversationState, system_prompt_base: str) -> str:
    """Build system content for cycle-service LLM call (Pilates, Aquagym — inscripción mensual)."""
    service_name = state.get("cycle_service_name") or "este servicio"
    extra_info = state.get("cycle_service_info") or ""
    extra_block = f"\n\nInformación del servicio: {extra_info}" if extra_info else ""
    return (
        f"{system_prompt_base}\n\n"
        "ACCIÓN REQUERIDA — SERVICIO POR CICLO / INSCRIPCIÓN\n"
        f"El paciente pregunta por {service_name}. "
        f"Este servicio funciona por inscripción al ciclo mensual/semanal, no por turno suelto.{extra_block}\n\n"
        "Tu misión:\n"
        "1. Explicá cómo funciona el ciclo (clases fijas semanales, no turno individual).\n"
        "2. Contá los horarios disponibles si los tenés en el contexto o en la base de conocimiento.\n"
        "3. Si el paciente quiere inscribirse, indicale que contacte a recepción para formalizar la inscripción "
        "(el agente no puede inscribir directamente en el ciclo).\n"
        "4. Si el paciente ya está inscripto y quiere avisar que no va a una clase, tomá nota y respondé con empatía.\n"
        "Usá voseo argentino, tono cálido y conciso."
    )


def _build_scheduling_context(state: ConversationState, system_prompt_base: str) -> str:
    """Build system content for scheduling-intent LLM calls.

    Slots available: injects slot display strings as plain-text bullet list.
    No slots: instructs LLM to deliver actionable no-availability message.
    """
    available_slots: list[dict] = state.get("available_slots") or []
    # Detect if the patient's first message was a greeting (to add warm intro)
    messages = state.get("messages") or []
    human_messages = [m for m in messages if getattr(m, "type", None) == "human"]
    is_first_interaction = len(human_messages) <= 2  # first 1-2 human messages
    greeting_hint = (
        "Si es el primer mensaje del paciente, empezá con un saludo cálido y breve antes de mostrar los turnos. "
        "Ej: '¡Hola! Claro, te busco algo ahora 😊'\n\n"
        if is_first_interaction else ""
    )

    if available_slots:
        EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣"]
        slots_text = "\n".join(
            f"{EMOJI_NUMBERS[i]} {slot['display']}"
            for i, slot in enumerate(available_slots[:3])
        )
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — PRESENTACIÓN DE TURNOS DISPONIBLES\n"
            f"{greeting_hint}"
            "Presentá los siguientes turnos al paciente con voseo argentino usando este formato exacto:\n\n"
            "Encontré estos turnos disponibles para vos:\n\n"
            f"{slots_text}\n\n"
            "¿Cuál te viene mejor? Podés elegir el número o decirme si preferís otro horario.\n\n"
            "CRÍTICO: Copiá cada turno EXACTAMENTE como aparece arriba (ej: 'Miércoles 10/06/2026 a las 14:00 hs'). "
            "NO abrevies la fecha, NO omitas el mes ni el año, NO cambies el formato DD/MM/YYYY."
        )
    else:
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SIN TURNOS DISPONIBLES\n"
            f"{greeting_hint}"
            "No hay turnos disponibles en los próximos días. "
            "Informá al paciente con calidez y ofrecé un paso siguiente accionable "
            "(por ejemplo: llamar a la clínica directamente o consultar en otro momento). "
            "Usá voseo argentino."
        )


def _build_booking_context(state: ConversationState, system_prompt_base: str) -> str:
    """Build system content for booking-intent LLM calls."""
    if state.get("booking_ambiguous_slot", False):
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SELECCIÓN AMBIGUA DE TURNO\n"
            "El paciente quiso confirmar un turno pero no especificó cuál de las opciones eligió. "
            "Pedile amablemente que especifique eligiendo el número 1, 2 o 3. Usá voseo argentino."
        )
    booking_action: str = state.get("booking_action", "confirm")
    event_id = state.get("calendar_event_id")
    booked_slot: dict = state.get("booked_slot") or {}
    if booking_action == "cancel_pending":
        if event_id:
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — CONFIRMAR CANCELACIÓN DE TURNO\n"
                "El paciente quiere cancelar su turno. Encontramos un turno reservado. "
                "Preguntale explícitamente: '¿Confirmás cancelar tu turno? Respondé SI para confirmar.' "
                "Usá voseo argentino cálido. No canceles nada todavía — solo pedí confirmación."
            )
        else:
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — TURNO NO ENCONTRADO PARA CANCELAR\n"
                "No se encontró un turno reservado a nombre del paciente para cancelar. "
                "Informá al paciente y sugerí que llame directamente a la clínica. "
                "Usá voseo argentino."
            )
    if booking_action == "cancel":
        if event_id:
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — CANCELACIÓN DE TURNO EXITOSA\n"
                "El turno del paciente fue cancelado exitosamente. "
                "Confirmá la cancelación con calidez en voseo argentino."
            )
        else:
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — TURNO NO ENCONTRADO PARA CANCELAR\n"
                "No se encontró un turno reservado a nombre del paciente para cancelar. "
                "Informá al paciente y sugerí que llame directamente a la clínica. "
                "Usá voseo argentino."
            )
    else:  # confirm
        if event_id and booked_slot:
            display = booked_slot.get("display", "")
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — TURNO CONFIRMADO EXITOSAMENTE\n"
                "El turno fue reservado. Incluí el siguiente texto de turno en tu respuesta "
                "exactamente como aparece, sin modificarlo ni parafrasearlo:\n\n"
                f"{display}\n\n"
                "Envolvé este dato en una respuesta cálida en voseo argentino."
            )
        else:
            return (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — TURNO NO DISPONIBLE\n"
                "El turno no pudo confirmarse porque ya no hay disponibilidad en ese horario. "
                "Informá al paciente con calidez y ofrecé buscar otras opciones. "
                "Usá voseo argentino."
            )


def generation_node(state: ConversationState) -> dict:
    """Genera respuesta del agente inyectando System Prompt + contexto RAG.

    Flujo principal (is_medical_query=False):
        Construye: [SystemMessage(empathy_modifier? + system_prompt + rag_context?)] + messages
        Llama al LLM y retorna la respuesta.

    Flujo anti-diagnóstico (is_medical_query=True):
        Retorna ANTI_DIAGNOSTIC_RESPONSE de forma determinista sin llamar al LLM.
        El nodo anti_diagnostic_node upstream es quien activa este bypass.

    Returns:
        dict with {"messages": [AIMessage]} — the add_messages reducer in
        ConversationState appends the response to the existing history.

    Raises:
        Re-raises any LLM exception after logging — only raised on flujo principal.
    """
    tenant_id = state["tenant_id"]

    # Shadow mode bypass — kill switch activo: redirigir honestamente al paciente
    if state.get("shadow_mode_active", False):
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="shadow_mode_redirect",
        )
        return {"messages": [AIMessage(content=SHADOW_MODE_REDIRECT_RESPONSE)]}

    # Anti-diagnostic bypass — guardrail legal: precede a todo llamado al LLM (RESP-07)
    is_medical_query: bool = state.get("is_medical_query", False)
    if is_medical_query:
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            is_medical_query=True,
            scheduling_intent=False,
            response_type="hardcoded_medical",
        )
        return {"messages": [AIMessage(content=ANTI_DIAGNOSTIC_RESPONSE)]}

    # Walk-in service — sin turno previo, solo por orden de llegada
    if state.get("walk_in_service", False):
        service_name = state.get("selected_service_name") or "este servicio"
        greeting = "¡Hola! 😊 " if state.get("is_first_contact", False) else ""
        msg = (
            f"{greeting}{service_name} atiende sin turno previo, por orden de llegada. "
            "Podés acercarte directamente a la clínica en el horario de atención. "
            "¿Necesitás saber los horarios o tenés alguna otra consulta?"
        )
        logger.info("generation_node.done", tenant_id=tenant_id, response_type="walk_in_service")
        return {"messages": [AIMessage(content=msg)]}

    # Cycle service — Pilates/Aquagym: inscripción al ciclo, no turno suelto
    if state.get("cycle_service_active", False):
        system_prompt_base: str = _build_system_prompt(state)
        system_content = _build_cycle_context(state, system_prompt_base)
        messages_for_llm = _build_messages_for_llm(system_content, state)
        try:
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="cycle_service",
            )
            return {"messages": [response]}
        except Exception as exc:
            logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
            raise

    # Gated service — requiere consulta médica previa antes de poder agendar
    if state.get("gated_service_active", False):
        system_prompt_base: str = _build_system_prompt(state)
        system_content = _build_gated_context(state, system_prompt_base)
        messages_for_llm = _build_messages_for_llm(system_content, state)
        try:
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="gated_service_prerequisite",
            )
            return {"messages": [response]}
        except Exception as exc:
            logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
            raise

    # v1.4: Registration gate — intercepts to collect name (Phase A), DNI (Phase B), or extended data (Phase D)
    if (state.get("name_collection_active") and not state.get("patient_name")) or \
       (state.get("dni_collection_active") and not state.get("patient_dni")) or \
       state.get("extended_collection_active"):
        return _handle_registration(state, tenant_id)

    # Booking path — LLM genera confirmaciones/cancelaciones de turno (RESP-02, RESP-03, RESP-05)
    booking_intent: bool = state.get("booking_intent", False)
    if booking_intent:
        system_prompt_base: str = _build_system_prompt(state)
        system_content = _build_booking_context(state, system_prompt_base)
        booking_action_for_log: str = state.get("booking_action", "confirm")
        event_id_for_log = state.get("calendar_event_id")
        booked_slot_for_log: dict = state.get("booked_slot") or {}
        if state.get("booking_ambiguous_slot", False):
            response_type = "booking_clarification"
        elif booking_action_for_log == "cancel_pending":
            response_type = "booking_cancel_pending" if event_id_for_log else "booking_not_found"
        elif booking_action_for_log == "cancel":
            response_type = "booking_cancelled" if event_id_for_log else "booking_not_found"
        else:
            response_type = "booking_confirmed" if (event_id_for_log and booked_slot_for_log) else "booking_failed"
        messages_for_llm = _build_messages_for_llm(system_content, state)
        try:
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                is_medical_query=False,
                booking_intent=True,
                scheduling_intent=False,
                response_type=response_type,
            )
            return {"messages": [response]}
        except Exception as exc:
            logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
            raise

    # v1.3: Service selection path — el paciente no especificó qué servicio quiere
    # Usa RAG (search_knowledge_tool) para obtener los servicios disponibles
    if state.get("service_selection_pending"):
        system_prompt_base: str = _build_system_prompt(state)
        system_content = (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SELECCIÓN DE SERVICIO\n"
            "El paciente quiere sacar un turno pero no especificó para qué servicio. "
            "Usá search_knowledge_tool para consultar qué servicios ofrece la clínica, "
            "y luego preguntale al paciente cuál necesita. "
            "Presentá las opciones de forma natural y breve. Usá voseo argentino."
        )
        messages_for_llm = _build_messages_for_llm(system_content, state)
        search_tool = make_search_tool(tenant_id)
        llm_with_tools = _get_llm().bind_tools([search_tool], tool_choice="required")
        try:
            first_response = llm_with_tools.invoke(messages_for_llm)
            tool_calls = getattr(first_response, "tool_calls", None)
            if isinstance(tool_calls, list) and tool_calls:
                tool_call = tool_calls[0]
                tool_result = search_tool.invoke(tool_call["args"])
                tool_message = ToolMessage(
                    content=tool_result or "Sin resultados.",
                    tool_call_id=tool_call["id"],
                )
                messages_with_tool = messages_for_llm + [first_response, tool_message]
                response = _get_llm().invoke(messages_with_tool)
            else:
                response = first_response
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="service_selection_ask",
            )
            return {"messages": [response]}
        except Exception as exc:
            logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
            raise

    # Scheduling path — LLM genera presentación de turnos en prosa natural (RESP-01, RESP-04)
    scheduling_intent: bool = state.get("scheduling_intent", False)
    if scheduling_intent:
        system_prompt_base: str = _build_system_prompt(state)
        available_slots_for_log: list[dict] = state.get("available_slots") or []
        response_type = "scheduling_slots" if available_slots_for_log else "scheduling_no_slots"
        system_content = _build_scheduling_context(state, system_prompt_base)
        messages_for_llm = _build_messages_for_llm(system_content, state)
        try:
            response = _get_llm().invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                is_medical_query=False,
                scheduling_intent=True,
                response_type=response_type,
            )
            return {"messages": [response]}
        except Exception as exc:
            logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
            raise

    # Fix D: Saludo inicial — evitar que RAG forzado liste servicios en primer "hola"
    _all_messages = state.get("messages") or []
    _human_msg_count = sum(1 for m in _all_messages if getattr(m, "type", None) == "human")
    if _human_msg_count == 1:
        _last_human = next(
            (m for m in reversed(_all_messages) if getattr(m, "type", None) == "human"), None
        )
        _last_text = (_last_human.content if _last_human else "").strip()
        _last_lower = _last_text.lower()
        _GREETING_STARTERS = ("hola", "buenas", "hi", "hey", "buen dia", "buendia")
        if len(_last_text.split()) <= 3 and any(_last_lower.startswith(g) for g in _GREETING_STARTERS):
            _greet_system = _build_system_prompt(state)
            _greet_content = (
                f"{_greet_system}\n\n"
                "ACCIÓN REQUERIDA — SALUDO INICIAL\n"
                "El paciente acaba de escribir un saludo. Respondé con un saludo cálido y breve. "
                "Presentate como recepcionista virtual de la clínica y preguntá en qué podés ayudar. "
                "Máximo 2 oraciones. Usá voseo argentino. No listes servicios ni hagas preguntas adicionales."
            )
            _greet_messages = _build_messages_for_llm(_greet_content, state)
            try:
                response = _get_llm().invoke(_greet_messages)
                logger.info(
                    "generation_node.done",
                    tenant_id=tenant_id,
                    response_type="greeting",
                )
                return {"messages": [response]}
            except Exception as exc:
                logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
                raise

    system_prompt: str = _build_system_prompt(state)
    empathy_mode: str = state.get("empathy_mode", "normal")

    system_content = system_prompt
    if empathy_mode == "urgent":
        system_content = EMPATHY_MODIFIER + "\n\n" + system_prompt

    messages_for_llm = _build_messages_for_llm(system_content, state)

    # RAG-01/03: LLM calls search_knowledge_tool inline via tool_choice="required".
    # The tool is scoped to the tenant — the LLM never controls which tenant is searched.
    search_tool = make_search_tool(tenant_id)
    llm_with_tools = _get_llm().bind_tools([search_tool], tool_choice="required")

    try:
        first_response = llm_with_tools.invoke(messages_for_llm)
        tool_calls = getattr(first_response, "tool_calls", None)
        if isinstance(tool_calls, list) and tool_calls:
            # RAG-01: execute tool inline, add ToolMessage, call LLM for final response
            tool_call = tool_calls[0]
            tool_result = search_tool.invoke(tool_call["args"])
            tool_message = ToolMessage(
                content=tool_result or "Sin resultados.",
                tool_call_id=tool_call["id"],
            )
            messages_with_tool = messages_for_llm + [first_response, tool_message]
            response = _get_llm().invoke(messages_with_tool)
        else:
            response = first_response
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_len=len(response.content),
            rag_used=bool(tool_calls),
            empathy_mode=empathy_mode,
            is_medical_query=False,
            scheduling_intent=False,
            response_type="llm",
        )
        return {"messages": [response]}
    except Exception as exc:
        logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
        raise

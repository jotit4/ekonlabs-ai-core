"""Nodo: generar respuesta IA con contexto RAG + System Prompt del Tenant."""
from __future__ import annotations

import re
from datetime import datetime, timezone, timedelta

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from app.agent.tools.search_tool import make_search_tool
from langchain_openai import ChatOpenAI

from app.agent.state import ConversationState
from app.core.logging import get_logger
from app.services import calendar_service, tenant_service

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

Paso 4. El sistema confirma la reserva. Comunicalo con calidez e incluí los datos exactos.

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


def _build_system_prompt(state: ConversationState) -> str:
    """Ensambla el system prompt final: DEFAULT + contexto del tenant (aditivo, no reemplazo).

    state["system_prompt"] contiene el system_prompt_override del tenant desde Supabase.
    Si existe, se añade al DEFAULT como <contexto_clinica> — nunca lo reemplaza.
    Esto garantiza que las reglas genéricas del agente siempre estén presentes.
    """
    tenant_context = state.get("system_prompt") or ""
    if tenant_context:
        return (
            DEFAULT_SYSTEM_PROMPT
            + "\n\n<contexto_clinica>\n"
            + tenant_context
            + "\n</contexto_clinica>"
        )
    return DEFAULT_SYSTEM_PROMPT


def _extract_patient_name(text: str) -> str | None:
    """Extract patient name from message using prefix-stripping heuristic.

    Strips common Argentine Spanish name-introduction phrases then validates
    the remainder looks like a name (1–4 words, no digits, all Unicode letters).
    Returns the name as-is (original casing preserved), or None.
    """
    cleaned = text.strip()
    lower = cleaned.lower()
    for prefix in ("me llamo ", "soy ", "mi nombre es ", "mi nombre: ", "nombre: "):
        if lower.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
            break
    words = cleaned.split()
    if not (2 <= len(words) <= 4):
        return None
    if any(c.isdigit() for c in cleaned):
        return None
    if not re.match(r"^[\w\s\-\.\']+$", cleaned, re.UNICODE):
        return None
    return cleaned


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


def _handle_name_collection(state: ConversationState, tenant_id: str) -> dict:
    """Handle the name collection turns when name_collection_active=True.

    Turn 1 (name_attempts == 0): Ask for name, set name_attempts=1.
    Turn 2+ (name_attempts >= 1): Try to extract name from last human message.
      - Name found → create calendar event inline, confirm booking (NAME-06).
      - No name, attempts < 2 → ask again, increment name_attempts.
      - No name, attempts >= 2 → is_paused=True for human handoff (NAME-05).
    Slot expiry → inform patient, clear name_collection_active (NAME-07).
    """
    name_attempts: int = state.get("name_attempts") or 0
    booked_slot: dict = state.get("booked_slot") or {}
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
        messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
        response = _llm.invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_type="name_collection_slot_expired",
        )
        return {
            "messages": [response],
            "name_collection_active": False,
            "booking_intent": False,
        }

    # Extract name from last human message (only if agent has already asked)
    if name_attempts >= 1:
        messages = state.get("messages") or []
        last_human_text = ""
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                last_human_text = msg.content
                break

        patient_name = _extract_patient_name(last_human_text)

        if patient_name:
            # NAME-06: create event inline with patient name in title
            phone_number = state["phone_number"]
            service_name = state.get("selected_service_name")
            selected_service_id = state.get("selected_service_id")
            try:
                tenant_config = tenant_service.get_tenant_config(tenant_id)
                creds = tenant_config.calendar_credentials or {}
                # v1.3: usar calendar_id del servicio si está disponible
                if selected_service_id:
                    services = tenant_service.get_tenant_services(tenant_id)
                    svc = next((s for s in services if str(s.service_id) == selected_service_id), None)
                    cal_id = svc.calendar_id if svc else tenant_config.calendar_id
                else:
                    cal_id = tenant_config.calendar_id
                event_title = f"{service_name} — {patient_name}" if service_name else f"Turno — {patient_name}"
                event_id = calendar_service.create_event(
                    calendar_id=cal_id,
                    credentials_dict=creds,
                    start_iso=booked_slot["start"],
                    end_iso=booked_slot["end"],
                    phone_number=phone_number,
                    title=event_title,
                )
            except Exception as exc:
                logger.error(
                    "generation_node.name_collection_event_error",
                    tenant_id=tenant_id,
                    error=str(exc),
                )
                raise

            display = booked_slot.get("display", "")
            system_content = (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — TURNO CONFIRMADO CON NOMBRE\n"
                f"El turno fue reservado a nombre de {patient_name}. "
                "Incluí el siguiente texto de turno en tu respuesta exactamente como aparece:\n\n"
                f"{display}\n\n"
                "Dirigite al paciente por su nombre. Usá voseo argentino cálido."
            )
            messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
            response = _llm.invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="booking_from_generation",
            )
            return {
                "messages": [response],
                "patient_name": patient_name,
                "name_collection_active": False,
                "calendar_event_id": event_id,
            }

        # NAME-05: no name after 2 attempts → human handoff
        if name_attempts >= 2:
            system_content = (
                f"{system_prompt_base}\n\n"
                "ACCIÓN REQUERIDA — DERIVAR A RECEPCIÓN HUMANA\n"
                "El paciente no pudo proporcionar su nombre después de dos intentos. "
                "Informá con calidez que lo va a atender un miembro del equipo. "
                "Usá voseo argentino."
            )
            messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
            response = _llm.invoke(messages_for_llm)
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="name_collection_handoff",
            )
            return {
                "messages": [response],
                "is_paused": True,
                "name_collection_active": False,
            }

    # Ask for name (Turn 1, or re-ask on Turn 2 when no name found)
    slot_display = booked_slot.get("display", "")
    system_content = (
        f"{system_prompt_base}\n\n"
        "ACCIÓN REQUERIDA — SOLICITAR NOMBRE DEL PACIENTE\n"
        "El paciente seleccionó el siguiente turno:\n\n"
        f"{slot_display}\n\n"
        "Antes de confirmar, necesitás su nombre completo (nombre y apellido) para registrar "
        "el turno en el sistema. Pedíselo de forma amable y natural en voseo argentino."
    )
    messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
    response = _llm.invoke(messages_for_llm)
    logger.info(
        "generation_node.done",
        tenant_id=tenant_id,
        response_type="name_collection_ask",
        name_attempts=name_attempts,
    )
    return {
        "messages": [response],
        "name_attempts": name_attempts + 1,
    }


# Module-level singleton — initialized once at import time.
# Tests must patch at: app.agent.nodes.generation._llm
_llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0.5, request_timeout=20)


def _build_scheduling_context(state: ConversationState, system_prompt_base: str) -> str:
    """Build system content for scheduling-intent LLM calls.

    Slots available: injects slot display strings as plain-text bullet list.
    No slots: instructs LLM to deliver actionable no-availability message.
    """
    available_slots: list[dict] = state.get("available_slots") or []
    if available_slots:
        EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣"]
        slots_text = "\n".join(
            f"{EMOJI_NUMBERS[i]} {slot['display']}"
            for i, slot in enumerate(available_slots[:3])
        )
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — PRESENTACIÓN DE TURNOS DISPONIBLES\n"
            "Presentá los siguientes turnos al paciente con voseo argentino usando este formato exacto:\n\n"
            "Encontré estos turnos disponibles para vos:\n\n"
            f"{slots_text}\n\n"
            "¿Cuál te viene mejor? Podés elegir el número o decirme si preferís otro horario.\n\n"
            "Incluí el texto de los turnos exactamente como aparece arriba. No lo reformatees."
        )
    else:
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — SIN TURNOS DISPONIBLES\n"
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

    # NAME-04/05/06/07: Name collection gate — intercepts before booking to collect patient name
    if state.get("name_collection_active") and not state.get("patient_name"):
        return _handle_name_collection(state, tenant_id)

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
        elif booking_action_for_log == "cancel":
            response_type = "booking_cancelled" if event_id_for_log else "booking_not_found"
        else:
            response_type = "booking_confirmed" if (event_id_for_log and booked_slot_for_log) else "booking_failed"
        messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
        try:
            response = _llm.invoke(messages_for_llm)
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
        messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
        search_tool = make_search_tool(tenant_id)
        llm_with_tools = _llm.bind_tools([search_tool], tool_choice="required")
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
                response = _llm.invoke(messages_with_tool)
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
        messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])
        try:
            response = _llm.invoke(messages_for_llm)
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

    system_prompt: str = _build_system_prompt(state)
    empathy_mode: str = state.get("empathy_mode", "normal")

    system_content = system_prompt
    if empathy_mode == "urgent":
        system_content = EMPATHY_MODIFIER + "\n\n" + system_prompt

    messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])

    # RAG-01/03: LLM calls search_knowledge_tool inline via tool_choice="required".
    # The tool is scoped to the tenant — the LLM never controls which tenant is searched.
    search_tool = make_search_tool(tenant_id)
    llm_with_tools = _llm.bind_tools([search_tool], tool_choice="required")

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
            response = _llm.invoke(messages_with_tool)
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

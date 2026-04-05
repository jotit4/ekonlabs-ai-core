"""Nodo: generar respuesta IA con contexto RAG + System Prompt del Tenant."""
from __future__ import annotations

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from app.agent.tools.search_tool import make_search_tool
from langchain_openai import ChatOpenAI

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

DEFAULT_SYSTEM_PROMPT = """Sos una recepcionista virtual de recepción de una clínica médica argentina. \
Tu función es atender a los pacientes con calidez y eficiencia: responder sus consultas \
sobre la clínica y coordinar turnos. Siempre hablás en voseo argentino — nunca uses "tú", \
"usted" ni conjugaciones peninsulares. El tono es informal-cálido: cercano, paciente y directo.

## OBJETIVO CONVERSACIONAL
Cada respuesta tuya debe avanzar hacia una solución concreta. Si el paciente quiere un turno, \
llevalo hacia la confirmación. Si tiene una pregunta, respondela con información precisa y luego \
ofrecé el siguiente paso. No hagas preguntas de más: una pregunta clara por vez es suficiente.

## IDENTIDAD
Sos una asistente virtual con IA. Si el paciente te pregunta si sos una persona o un bot, \
respondé con honestidad: "Soy una asistente virtual de la clínica." No finjas ser humana, \
pero tampoco te presentes proactivamente como IA — esperá a que te pregunten.

## PROTOCOLO DE TURNOS Y RECEPCIÓN
- Para agendar: mostrá hasta 3 opciones de turno con fecha, hora y duración. Esperá que el \
  paciente elija antes de confirmar.
- Al confirmar: repetí los datos exactos del turno (fecha y hora). Nunca inventes horarios.
- Para cancelar: confirmá la cancelación con los datos del turno cancelado.
- Nunca crees ni canceles eventos sin confirmación explícita del paciente.

## CONOCIMIENTO DE LA CLÍNICA
Para cualquier pregunta sobre precios, horarios de atención, servicios, especialidades, \
profesionales o políticas de la clínica, siempre usá la herramienta `search_knowledge_tool` \
antes de responder. Nunca inventes datos de la clínica — si la herramienta no devuelve \
información relevante, decile al paciente: "No tengo esa información, te recomiendo llamar \
directamente a la clínica."

## RESTRICCIONES
- Nunca des diagnósticos, recetas ni consejos médicos. Eso lo hace el profesional en consulta.
- No menciones precios ni servicios sin haber consultado `search_knowledge_tool` primero.
- No hagas promesas de devolución de llamada ni escalación humana que no existen.

## EJEMPLOS DE TONO

### Incorrecto — frío y genérico:
Paciente: "Hola, quería saber si tienen turnos disponibles"
Asistente: "Estimado usuario, para consultar disponibilidad sírvase indicar la especialidad requerida."

### Correcto — cálido, voseo, directo:
Paciente: "Hola, quería saber si tienen turnos disponibles"
Asistente: "¡Hola! Claro que sí. ¿Para cuándo lo necesitás y para qué especialidad?"

---

### Incorrecto — robótico ante dolor:
Paciente: "me duele mucho la muela, necesito turno urgente"
Asistente: "He registrado su solicitud. Se procederá a verificar disponibilidad."

### Correcto — empático y orientado a resolver:
Paciente: "me duele mucho la muela, necesito turno urgente"
Asistente: "¡Ay, qué molestia! Enseguida te busco algo para hoy o mañana. Dejame ver disponibilidad."
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
        slots_text = "\n".join(
            f"- {slot['display']}" for slot in available_slots[:3]
        )
        return (
            f"{system_prompt_base}\n\n"
            "ACCIÓN REQUERIDA — PRESENTACIÓN DE TURNOS DISPONIBLES\n"
            "Presentá los siguientes turnos al paciente en prosa natural con voseo argentino. "
            "No uses listas numeradas con emojis. Incluí el texto de cada turno exactamente "
            "como aparece abajo, sin reformatearlo ni parafrasearlo:\n\n"
            f"{slots_text}"
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

    # Booking path — LLM genera confirmaciones/cancelaciones de turno (RESP-02, RESP-03, RESP-05)
    booking_intent: bool = state.get("booking_intent", False)
    if booking_intent:
        system_prompt_base: str = state.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
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

    # Scheduling path — LLM genera presentación de turnos en prosa natural (RESP-01, RESP-04)
    scheduling_intent: bool = state.get("scheduling_intent", False)
    if scheduling_intent:
        system_prompt_base: str = state.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
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

    system_prompt: str = state.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
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

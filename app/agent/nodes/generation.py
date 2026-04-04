"""Nodo: generar respuesta IA con contexto RAG + System Prompt del Tenant."""
from __future__ import annotations

from langchain_core.messages import AIMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "Eres un asistente virtual de recepcion medica, amable y profesional. "
    "Ayudas a los pacientes a obtener informacion sobre los servicios de la clinica "
    "y a coordinar turnos. Responde siempre en el idioma del paciente. "
    "Se conciso, calido y claro. Nunca des diagnosticos ni consejos medicos."
)

EMPATHY_MODIFIER = (
    "IMPORTANTE — MODO URGENCIA ACTIVADO: El paciente está experimentando dolor "
    "o angustia. Responde con MAXIMA empatia: valida su dolor explicitamente, "
    "muéstrate disponible de inmediato, y prioriza ofrecer la cita mas urgente "
    "posible. Usa un tono calido, tranquilizador y humano. No minimices su malestar."
)

ANTI_DIAGNOSTIC_RESPONSE = (
    "Entiendo tu consulta, pero debo ser honesto/a contigo: "
    "no estoy habilitado/a para dar diagnósticos, recetas ni consejos médicos. "
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
    "Por favor, contactá a la clínica por los canales habituales para coordinar tu cita. "
    "¡Quedamos a tu disposición para cualquier otra consulta!"
)

LOW_CONFIDENCE_PAUSE_RESPONSE = (
    "En este momento no cuento con información suficiente para responderte con certeza. "
    "Tu consulta fue derivada a nuestro equipo para que un especialista te asista. "
    "Te contactaremos a la brevedad. Disculpá el inconveniente. 🙏"
)

DEFAULT_CONFIDENCE_THRESHOLD: float = 0.5

# Module-level singleton — initialized once at import time.
# Tests must patch at: app.agent.nodes.generation._llm
_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)


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

    # Booking bypass — si hay confirmación/cancelación de turno, respuesta determinista sin LLM
    booking_intent: bool = state.get("booking_intent", False)
    if booking_intent:
        # Check for ambiguous slot selection first — patient confirmed without specifying slot number
        if state.get("booking_ambiguous_slot", False):
            logger.info(
                "generation_node.done",
                tenant_id=tenant_id,
                response_type="booking_clarification",
            )
            return {"messages": [AIMessage(content=(
                "No pude identificar cuál turno preferís. "
                "¿Podés decirme el número? Por ejemplo: 1, 2 o 3."
            ))]}

        booking_action: str = state.get("booking_action", "confirm")
        event_id = state.get("calendar_event_id")
        booked_slot: dict = state.get("booked_slot") or {}

        if booking_action == "cancel":
            if event_id:
                response_text = BOOKING_CANCELLED
                response_type = "booking_cancelled"
            else:
                response_text = BOOKING_NOT_FOUND
                response_type = "booking_not_found"
        else:  # confirm
            if event_id and booked_slot:
                response_text = BOOKING_CONFIRMED_TEMPLATE.format(display=booked_slot.get("display", ""))
                response_type = "booking_confirmed"
            else:
                response_text = BOOKING_FAILED_NO_SLOTS
                response_type = "booking_failed"

        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            is_medical_query=False,
            booking_intent=True,
            scheduling_intent=False,
            response_type=response_type,
        )
        return {"messages": [AIMessage(content=response_text)]}

    # Anti-diagnostic bypass — si es consulta medica, responder con mensaje determinista sin LLM
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

    # Scheduling bypass — si hay intención de agendamiento, responder con slots disponibles
    scheduling_intent: bool = state.get("scheduling_intent", False)
    if scheduling_intent:
        available_slots: list[dict] = state.get("available_slots") or []
        if available_slots:
            emojis = ["1️⃣", "2️⃣", "3️⃣"]
            options_lines = "\n".join(
                f"{emojis[i]} {slot['display']}" for i, slot in enumerate(available_slots[:3])
            )
            response_text = (
                f"Encontré estos turnos disponibles para vos:\n\n"
                f"{options_lines}\n\n"
                "¿Cuál te viene mejor? Podés elegir el número o decirme si preferís otro horario."
            )
            response_type = "scheduling_slots"
        else:
            response_text = SCHEDULING_NO_SLOTS_RESPONSE
            response_type = "scheduling_no_slots"

        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            is_medical_query=False,
            scheduling_intent=True,
            response_type=response_type,
        )
        return {"messages": [AIMessage(content=response_text)]}

    system_prompt: str = state.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
    rag_context: str = state.get("rag_context", "")
    empathy_mode: str = state.get("empathy_mode", "normal")

    # RAG-02: No binary confidence gate — empty rag_context proceeds to LLM with system prompt only.
    # The LLM uses its DEFAULT_SYSTEM_PROMPT instructions when no knowledge base context is available.

    system_content = system_prompt
    if empathy_mode == "urgent":
        system_content = EMPATHY_MODIFIER + "\n\n" + system_prompt
    if rag_context:
        system_content = (
            f"{system_content}\n\n"
            "## Información de la Clínica (úsala para responder):\n"
            f"{rag_context}"
        )

    messages_for_llm = [SystemMessage(content=system_content)] + list(state["messages"])

    try:
        response = _llm.invoke(messages_for_llm)
        logger.info(
            "generation_node.done",
            tenant_id=tenant_id,
            response_len=len(response.content),
            rag_used=bool(rag_context),
            empathy_mode=empathy_mode,
            is_medical_query=False,
            scheduling_intent=False,
            response_type="llm",
        )
        return {"messages": [response]}
    except Exception as exc:
        logger.error("generation_node.error", tenant_id=tenant_id, error=str(exc))
        raise

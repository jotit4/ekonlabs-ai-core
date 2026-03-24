"""Tareas asíncronas procesadas por RQ Worker."""
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.graph import graph as conversation_graph
from app.agent.state import ConversationState
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.services.conversation_service import get_conversation_history, save_message
from app.services.tenant_service import get_tenant_config

logger = get_logger(__name__)


def _extract_message_info(payload: dict) -> tuple[str, str] | None:
    """Extrae (phone_number, message_text) del payload de WhatsApp.

    NOTA: payload llega en formato by_alias=True (clave "from", NO "from_").
    Este formato fue establecido en Story 2.1 fix F1 (model_dump(by_alias=True)).

    Returns:
        (phone_number, message_text) o None si el payload no tiene mensaje de texto válido.
    """
    try:
        entries = payload.get("entry") or []
        if not entries:
            return None
        messages = (
            entries[0]
            .get("changes", [{}])[0]
            .get("value", {})
            .get("messages")
        )
        if not messages:
            return None
        msg = messages[0]
        phone_number = msg["from"]       # "from" — clave original Meta API (by_alias=True)
        message_text = msg["text"]["body"]
        return phone_number, message_text
    except (KeyError, IndexError, TypeError):
        return None


def _build_lc_messages(history_rows: list[dict], new_message: str) -> list[BaseMessage]:
    """Convierte filas de Supabase + nuevo mensaje a lista de LangChain messages.

    Args:
        history_rows: Filas de conversations en orden cronológico ascendente.
        new_message: Texto del mensaje entrante del paciente.

    Returns:
        Lista de LangChain messages (historial + HumanMessage nuevo al final).
    """
    messages: list[BaseMessage] = []
    for row in history_rows:
        role = row.get("role", "user")
        content = row.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))
    messages.append(HumanMessage(content=new_message))
    return messages


def process_whatsapp_message(payload: dict, tenant_id: str) -> None:
    """Procesa un mensaje de WhatsApp entrante usando el grafo LangGraph.

    Carga historial desde Supabase, invoca el grafo de conversación y persiste
    el mensaje del usuario. Función SINCRÓNICA — los workers RQ son síncronos.

    Args:
        payload: WhatsApp webhook payload serializado con by_alias=True.
                 Las claves siguen el formato Meta API (ej. "from", no "from_").
        tenant_id: UUID del tenant como string.
    """
    # --- 1. Extraer mensaje del payload (AC5: manejo defensivo) ---
    msg_info = _extract_message_info(payload)
    if msg_info is None:
        logger.warning(
            "Payload sin mensaje válido — descartando",
            tenant_id=tenant_id,
        )
        return

    phone_number, message_text = msg_info
    logger.info(
        "Procesando mensaje WhatsApp",
        tenant_id=tenant_id,
        phone_number=phone_number,
    )

    # --- 2. Cargar historial de conversación ---
    history_rows = get_conversation_history(phone_number=phone_number, tenant_id=tenant_id)

    # --- 3. Construir estado inicial del grafo ---
    initial_state: ConversationState = {
        "tenant_id": tenant_id,
        "phone_number": phone_number,
        "messages": _build_lc_messages(history_rows, message_text),
        "confidence_score": 1.0,
        "is_paused": False,
    }

    try:
        tenant_config = get_tenant_config(tenant_id)
        if tenant_config.system_prompt_override is not None:
            initial_state["system_prompt"] = tenant_config.system_prompt_override
    except AppException as exc:
        logger.warning(
            "Error cargando configuración del tenant — continuando sin system_prompt",
            tenant_id=tenant_id,
            error=str(exc),
        )

    # --- 4. Invocar grafo LangGraph ---
    thread_id = f"{tenant_id}:{phone_number}"
    try:
        conversation_graph.invoke(
            initial_state,
            config={"configurable": {"thread_id": thread_id}},
        )
    except Exception as exc:
        logger.error(
            "Error invocando grafo LangGraph — mensaje no guardado",
            tenant_id=tenant_id,
            phone_number=phone_number,
            error=str(exc),
        )
        return

    # --- 5. Persistir mensaje del usuario en Supabase ---
    save_message(
        phone_number=phone_number,
        tenant_id=tenant_id,
        role="user",
        content=message_text,
    )

    logger.info(
        "Mensaje procesado y persistido correctamente",
        tenant_id=tenant_id,
        phone_number=phone_number,
        history_loaded=len(history_rows),
    )

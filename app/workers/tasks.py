"""Tareas asíncronas procesadas por RQ Worker."""
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.graph import graph as conversation_graph
from app.agent.state import ConversationState
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.services.conversation_service import get_conversation_history, save_message
from app.services.tenant_service import get_tenant_config
from app.services.thread_state_service import get_thread_status, set_thread_active, set_thread_paused
from app.core.config import settings
from app.services.whatsapp_service import send_message as send_whatsapp_message

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Slash commands — Story 4.2
# ---------------------------------------------------------------------------
# Comandos internos que la recepcionista puede enviar desde el número oficial
# de la clínica para controlar el estado del agente IA en un hilo.
# Case-insensitive (normalizado a lowercase antes de comparar).
_RESUME_COMMANDS: frozenset[str] = frozenset({"/resume"})


def _is_resume_command(text: str) -> bool:
    """Retorna True si el texto es un slash command de reactivación válido.

    Case-insensitive. Ignora espacios al inicio/fin.
    Ejemplos: "/resume", "/RESUME", "  /resume  " → True.

    Returns:
        True si el texto corresponde a un comando de resume conocido.
    """
    return text.strip().lower() in _RESUME_COMMANDS


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


def _extract_phone_number_id(payload: dict) -> str | None:
    """Extrae phone_number_id del metadata del webhook (ID del numero de negocio Meta).

    NOTA: Es el ID del numero empresarial de la clinica en Meta, NO el numero del paciente.
    Viene en payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"].

    Returns:
        phone_number_id como string, o None si el payload no tiene ese campo.
    """
    try:
        return payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
    except (KeyError, IndexError, TypeError):
        return None


def _extract_display_phone(payload: dict) -> str | None:
    """Extrae display_phone_number del metadata del webhook (número oficial de la clínica).

    Usado para detectar mensajes salientes (human_takeover): si messages[0]["from"]
    coincide con este valor, el mensaje fue enviado por la clínica, no por el paciente.

    Returns:
        display_phone_number como string, o None si el payload no tiene ese campo.
    """
    try:
        return payload["entry"][0]["changes"][0]["value"]["metadata"]["display_phone_number"]
    except (KeyError, IndexError, TypeError):
        return None


def _extract_patient_from_contacts(payload: dict) -> str | None:
    """Extrae el número del paciente desde contacts[0]['wa_id'] en webhooks salientes.

    En mensajes outbound (clínica → paciente), el array contacts contiene al destinatario.
    Este campo identifica el hilo del paciente que debe pausarse.

    Returns:
        wa_id del contacto (número del paciente) como string, o None si contacts está vacío.
    """
    try:
        contacts = payload["entry"][0]["changes"][0]["value"].get("contacts") or []
        if not contacts:
            return None
        return contacts[0].get("wa_id")
    except (KeyError, IndexError, TypeError):
        return None


def process_whatsapp_message(payload: dict, tenant_id: str) -> None:
    """Procesa un mensaje de WhatsApp entrante usando el grafo LangGraph.

    Carga historial desde Supabase, invoca el grafo de conversación y persiste
    el mensaje del usuario. Función SINCRÓNICA — los workers RQ son síncronos.

    Detecta mensajes salientes (from == display_phone_number) con dos ramificaciones:
    - Story 4.2: Slash command (/resume) → reactiva el hilo del paciente y retorna.
    - Story 4.1: Mensaje regular → pausa el hilo (human_takeover) y retorna.
    En ambos casos retorna temprano sin invocar el grafo ni enviar respuesta IA.

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

    # --- 1b. Detección de mensaje saliente — Story 4.1 + Story 4.2 ---
    # Si messages[0]["from"] == display_phone_number → mensaje enviado por la clínica.
    # Dos casos posibles:
    #   4.2: Slash command (/resume) → reactivar hilo (prioridad sobre human_takeover)
    #   4.1: Mensaje regular       → pausar hilo (human_takeover)
    # NOTA: Race condition teórica con workers paralelos es una limitación aceptada
    # de la arquitectura eventual-consistent (MVP). El UPSERT es idempotente.
    display_phone = _extract_display_phone(payload)
    if display_phone and phone_number == display_phone:
        # Story 4.2: Slash commands tienen prioridad — se evalúan antes del human_takeover
        if _is_resume_command(message_text):
            patient_phone = _extract_patient_from_contacts(payload)
            if patient_phone:
                try:
                    set_thread_active(
                        tenant_id=tenant_id,
                        phone_number=patient_phone,
                    )
                    logger.info(
                        "resume_flow.activated",
                        tenant_id=tenant_id,
                        patient_phone=patient_phone,
                    )
                except Exception as exc:
                    logger.error(
                        "resume_flow.activate_error",
                        tenant_id=tenant_id,
                        patient_phone=patient_phone,
                        error=str(exc),
                    )
            else:
                logger.warning(
                    "resume_flow.no_patient_phone — hilo no reactivado",
                    tenant_id=tenant_id,
                )
            return  # Salida temprana — comando silencioso, no procesar como mensaje de paciente

        # Story 4.1: Mensaje saliente regular → human_takeover (pausar hilo)
        patient_phone = _extract_patient_from_contacts(payload)
        if patient_phone:
            try:
                set_thread_paused(
                    tenant_id=tenant_id,
                    phone_number=patient_phone,
                    reason="human_takeover",
                )
                logger.info(
                    "human_takeover.paused",
                    tenant_id=tenant_id,
                    patient_phone=patient_phone,
                )
            except Exception as exc:
                logger.error(
                    "human_takeover.pause_error",
                    tenant_id=tenant_id,
                    patient_phone=patient_phone,
                    error=str(exc),
                )
        else:
            logger.warning(
                "human_takeover.no_patient_phone — hilo no pausado",
                tenant_id=tenant_id,
            )
        return  # Salida temprana — no procesar mensaje saliente como entrada del paciente

    logger.info(
        "Procesando mensaje WhatsApp",
        tenant_id=tenant_id,
        phone_number=phone_number,
    )

    # --- 2. Cargar historial de conversación ---
    history_rows = get_conversation_history(phone_number=phone_number, tenant_id=tenant_id)

    # --- 2b. Guardia de hilo pausado — Story 3.4 ---
    # Si el hilo está PAUSED en DB, silenciar completamente (no invocar grafo ni enviar IA).
    thread_status = get_thread_status(tenant_id=tenant_id, phone_number=phone_number)
    if thread_status == "paused":
        logger.warning(
            "Hilo pausado — mensaje descartado sin respuesta IA",
            tenant_id=tenant_id,
            phone_number=phone_number,
        )
        return

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
    # Excepciones se propagan intencionalmente → RQ reintentará el job completo.
    # El mensaje del usuario se persiste (paso 5) solo si el grafo tiene éxito,
    # garantizando consistencia: si falla, el retry reprocesa desde historial limpio.
    thread_id = f"{tenant_id}:{phone_number}"
    result_state = conversation_graph.invoke(
        initial_state,
        config={"configurable": {"thread_id": thread_id}},
    )

    # --- 5. Persistir mensaje del usuario en Supabase ---
    save_message(
        phone_number=phone_number,
        tenant_id=tenant_id,
        role="user",
        content=message_text,
    )

    # --- 6. Extraer respuesta IA, enviar a WhatsApp y persistir (AC3 + AC4) ---
    ai_text: str | None = None
    for msg in reversed(result_state.get("messages", [])):
        if getattr(msg, "type", None) == "ai" and getattr(msg, "content", ""):
            ai_text = msg.content
            break

    if ai_text:
        phone_number_id = _extract_phone_number_id(payload)
        if phone_number_id and settings.META_ACCESS_TOKEN:
            try:
                send_whatsapp_message(
                    phone_number_id,
                    phone_number,
                    ai_text,
                    settings.META_ACCESS_TOKEN,
                )
            except Exception as exc:
                logger.warning(
                    "Error enviando respuesta WhatsApp — continuando",
                    tenant_id=tenant_id,
                    phone_number=phone_number,
                    error=str(exc),
                )
        elif not settings.META_ACCESS_TOKEN:
            logger.warning(
                "META_ACCESS_TOKEN no configurado — respuesta no enviada",
                tenant_id=tenant_id,
            )

        save_message(
            phone_number=phone_number,
            tenant_id=tenant_id,
            role="assistant",
            content=ai_text,
        )

    # --- 7. Persistir pausa en DB si el grafo detectó low confidence — Story 3.4 ---
    if result_state.get("is_paused"):
        try:
            set_thread_paused(
                tenant_id=tenant_id,
                phone_number=phone_number,
                reason=result_state.get("paused_reason", "low_confidence"),
            )
        except Exception as exc:
            logger.error(
                "Error persistiendo pausa de hilo — hilo no quedará pausado en DB",
                tenant_id=tenant_id,
                phone_number=phone_number,
                error=str(exc),
            )

    logger.info(
        "Mensaje procesado y persistido correctamente",
        tenant_id=tenant_id,
        phone_number=phone_number,
        history_loaded=len(history_rows),
        ai_response_sent=bool(ai_text),
        is_paused=bool(result_state.get("is_paused")),
    )

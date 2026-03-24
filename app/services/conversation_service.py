"""Servicio de historial de conversación — carga y persistencia en tabla `conversations`."""
from app.core.database import get_supabase_client
from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_HISTORY_MESSAGES = 20  # Últimos N mensajes para contexto del LLM


def get_conversation_history(
    phone_number: str,
    tenant_id: str,
    limit: int = MAX_HISTORY_MESSAGES,
) -> list[dict]:
    """Carga el historial de conversación desde Supabase, en orden cronológico.

    Filtra explícitamente por tenant_id Y phone_number — doble garantía de aislamiento
    multi-tenant (complementa la política RLS de Supabase).

    NOTA: Función sincrónica (supabase-py es blocking).
    Llamar directamente desde workers RQ (síncronos por diseño).

    Args:
        phone_number: Número de teléfono del paciente (sin "+", formato Meta API).
        tenant_id: UUID del tenant como string.
        limit: Máximo de mensajes a cargar (default: MAX_HISTORY_MESSAGES).

    Returns:
        Lista de dicts en orden cronológico ascendente (más antiguo primero).
        Lista vacía si no hay historial o si hay error de DB.
    """
    client = get_supabase_client()
    try:
        result = (
            client.table("conversations")
            .select("id, role, content, created_at")
            .eq("tenant_id", tenant_id)
            .eq("phone_number", phone_number)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "Error cargando historial de conversación",
            tenant_id=tenant_id,
            phone=phone_number,
            error=str(exc),
        )
        return []

    data = getattr(result, "data", None) or []
    # Supabase retorna DESC (más reciente primero) → invertir para orden cronológico
    return list(reversed(data))


def save_message(
    phone_number: str,
    tenant_id: str,
    role: str,
    content: str,
) -> None:
    """Persiste un mensaje en la tabla `conversations`.

    Silencia excepciones para no bloquear el flujo del worker RQ.
    La pérdida de un mensaje de historial es recuperable; un crash del worker no.

    Args:
        phone_number: Número de teléfono del paciente.
        tenant_id: UUID del tenant como string.
        role: Rol del mensaje ('user', 'assistant', 'system').
        content: Contenido textual del mensaje.
    """
    client = get_supabase_client()
    try:
        client.table("conversations").insert({
            "tenant_id": tenant_id,
            "phone_number": phone_number,
            "role": role,
            "content": content,
        }).execute()
    except Exception as exc:
        logger.warning(
            "Error guardando mensaje en conversations",
            tenant_id=tenant_id,
            phone=phone_number,
            role=role,
            error=str(exc),
        )

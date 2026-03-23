from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from supabase import Client

_supabase_client: Any | None = None


def get_supabase_client() -> "Client":
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client

        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client


def ping_supabase() -> bool:
    """Ejecuta una query de ping básica. Retorna True si la conexión es exitosa."""
    try:
        client = get_supabase_client()
        client.table("tenants").select("tenant_id").limit(1).execute()
        logger.info("Supabase ping OK")
        return True
    except Exception as exc:
        logger.warning("Supabase ping failed", error=str(exc))
        return False

"""Configuración del Rate Limiter global — slowapi + Redis backend."""
import time as _time

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_rate_limit_key(request: Request, tenant_id: str | None = None) -> str:
    """Genera la clave Redis de rate limiting con aislamiento per-tenant.

    Cuando tenant_id está presente, devuelve "rate:{tenant_id}" para
    garantizar que cada clínica tenga su propia ventana de conteo independiente.
    Si tenant_id es None (rutas sin contexto de tenant), usa "rate:global" como
    fallback seguro hasta que Story 2.1 establezca el contexto de tenant.

    Args:
        request: Objeto Request de FastAPI (requerido por slowapi).
        tenant_id: Identificador del tenant. None para fallback global.

    Returns:
        Clave de rate limit en formato "rate:{tenant_id}" o "rate:global".
    """
    if tenant_id is not None:
        return f"rate:{tenant_id}"
    return "rate:global"


# Instancia global del Limiter con backend Redis (sliding window counter).
# Si Redis no está disponible, slowapi hace fallback automático a MemoryStorage
# (aceptable para tests, NO para producción).
#
# RATE_LIMIT_BURST: límite por IP aplicado a TODAS las rutas (default_limits).
#   Protección de ráfaga a nivel de infraestructura, independiente del tenant.
#   Ejemplo: 50 req/min por IP como techo absoluto.
#
# RATE_LIMIT_REQUESTS_PER_MINUTE: límite per-tenant aplicado en cada endpoint
#   via @limiter.limit() decorador (Story 2.1+).
#
# NOTA: key_func por defecto es get_remote_address (por IP).
# El aislamiento per-tenant se logra pasando key_func personalizada en el
# DECORADOR de cada endpoint (Story 2.1+), no en la inicialización global.
#
# Patrón de uso en endpoints (Story 2.1):
#   @limiter.limit(
#       f"{settings.RATE_LIMIT_REQUESTS_PER_MINUTE}/minute",
#       key_func=lambda req: get_rate_limit_key(req, tenant_id=req.state.tenant_id)
#   )
#   async def receive_whatsapp_webhook(request: Request, ...): ...
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_BURST}/minute"],
    storage_uri=settings.REDIS_URL,
    in_memory_fallback_enabled=True,
)

logger.debug(
    "Rate limiter inicializado",
    requests_per_minute=settings.RATE_LIMIT_REQUESTS_PER_MINUTE,
    burst_per_ip=settings.RATE_LIMIT_BURST,
)

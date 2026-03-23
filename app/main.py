import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.database import get_supabase_client, ping_supabase
from app.core.exceptions import AppException
from app.core.logging import configure_logging, get_logger
from app.core.rate_limiter import limiter
from app.core.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.tenants import router as tenants_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    configure_logging()
    logger = get_logger(__name__)
    if settings.APP_ENV.lower() in {"test", "testing"}:
        logger.info("Skipping Supabase startup checks in test environment")
        yield
        return

    try:
        get_supabase_client()
        logger.info("Supabase client initialized")
    except Exception as exc:
        logger.error("Failed to initialize Supabase client", error=str(exc))
        raise

    # Verificar conectividad real — warn sin bloquear startup.
    try:
        ping_ok = await asyncio.wait_for(asyncio.to_thread(ping_supabase), timeout=3.0)
        if not ping_ok:
            logger.warning(
                "Supabase ping failed — verifique conectividad y que SUPABASE_KEY sea service_role key"
            )
    except asyncio.TimeoutError:
        logger.warning("Supabase ping timeout after 3s — continuing startup")
    yield


app = FastAPI(
    title="ekonlabs-ai-core",
    description="Clinical Multi-Tenant AI Agent Service",
    version="0.1.0",
    lifespan=lifespan,
)

# Integración de slowapi — rate limiting per-tenant via Redis sliding window
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


_rl_logger = get_logger("app.rate_limiter")


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Handler de 429 que respeta el formato estándar de error de la API."""
    # Calcular Retry-After usando get_expiry() del RateLimitItem (segundos de la ventana)
    retry_after = "60"
    if hasattr(exc, "limit") and exc.limit is not None:
        limit_item = getattr(exc.limit, "limit", None)
        if limit_item is not None and hasattr(limit_item, "get_expiry"):
            retry_after = str(limit_item.get_expiry())

    _rl_logger.warning(
        "Rate limit excedido",
        path=str(request.url.path),
        detail=exc.detail,
        retry_after=retry_after,
    )
    return JSONResponse(
        status_code=429,
        content={
            "status": "error",
            "data": None,
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Límite de tráfico excedido: {exc.detail}",
            },
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
        headers={"Retry-After": retry_after},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "data": None,
            "error": {"code": exc.code, "message": exc.message},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "data": None,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "El payload enviado no cumple el esquema requerido",
                "details": exc.errors(),
            },
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


app.include_router(health_router, prefix="/api/v1")
app.include_router(tenants_router, prefix="/api/v1")

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from redis import Redis

from app.core.database import get_supabase_client, ping_supabase
from app.core.exceptions import AppException
from app.core.logging import configure_logging, get_logger
from app.core.rate_limiter import limiter
from app.core.config import settings
from app.observability.sentry import configure_sentry
from app.api.v1.health import router as health_router
from app.api.v1.tenants import router as tenants_router
from app.api.v1.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Propagar variables de LangSmith a os.environ para que LangChain/LangSmith las lea.
    # Seteamos ambos prefijos: LANGCHAIN_* (SDK legacy) y LANGSMITH_* (SDK >=0.1, actual).
    configure_logging()
    configure_sentry()
    logger = get_logger(__name__)

    _tracing_raw = settings.LANGCHAIN_TRACING_V2
    _api_key = settings.LANGCHAIN_API_KEY
    _project = settings.LANGCHAIN_PROJECT
    logger.info(
        "langsmith.init",
        tracing_v2_setting=_tracing_raw,
        tracing_enabled=(_tracing_raw.lower() == "true"),
        api_key_set=bool(_api_key),
        api_key_prefix=_api_key[:12] if _api_key else "EMPTY",
        project=_project,
    )
    if _tracing_raw.lower() == "true":
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = _api_key
        os.environ["LANGCHAIN_PROJECT"] = _project
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGSMITH_API_KEY"] = _api_key
        os.environ["LANGSMITH_PROJECT"] = _project
        try:
            import langsmith
            client = langsmith.Client(api_key=_api_key)
            projects = list(client.list_projects())
            logger.info("langsmith.connection_ok", projects=[p.name for p in projects[:5]])
        except Exception as ls_exc:
            logger.error("langsmith.connection_failed", error=str(ls_exc))
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

    # Verificar Redis — falla en startup si REDIS_URL está mal configurado.
    redis_client = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
    try:
        redis_client.ping()
        logger.info("Redis connection verified")
    except Exception as exc:
        logger.error("Redis PING failed at startup — verifique REDIS_URL", error=str(exc))
        raise
    finally:
        redis_client.close()

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
app.include_router(webhooks_router, prefix="/api/v1")

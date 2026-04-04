"""WhatsApp webhook endpoints — GET challenge verification + POST message reception."""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from redis import Redis
from rq import Queue, Retry

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.core.rate_limiter import limiter
from app.core.security import verify_meta_signature, verify_webhook_challenge
from app.models.webhook import WhatsAppWebhookPayload
from app.services.tenant_service import get_tenant_by_phone
from app.workers.tasks import process_whatsapp_message

router = APIRouter(tags=["webhooks"])
logger = get_logger(__name__)

_redis_pool: Redis | None = None


def _get_redis_pool() -> Redis:
    """Lazy-initialized module-level Redis connection. Reused across requests."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = Redis.from_url(settings.REDIS_URL)
    return _redis_pool


def _success_response() -> dict:
    """Retorna el wrapper estándar de éxito para respuestas de webhook."""
    return {
        "status": "success",
        "data": None,
        "error": None,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    }


def _enqueue_task(payload_dict: dict, tenant_id: str) -> None:
    """Encola la tarea de procesamiento en RQ.

    Usa pool de conexión Redis a nivel de módulo (INFRA-04).
    Redis failure → AppException(status_code=503) para que Meta reintente (INFRA-02).
    Retry automático x3 con backoff para fallas transitorias (INFRA-03).
    """
    try:
        conn = _get_redis_pool()
        q = Queue("default", connection=conn)
        q.enqueue(
            process_whatsapp_message,
            payload_dict,
            tenant_id,
            retry=Retry(max=3, interval=[10, 30, 60]),
        )
    except Exception as exc:
        raise AppException(
            code="REDIS_UNAVAILABLE",
            message=f"Redis no disponible: {exc}",
            status_code=503,
        ) from exc


@router.get("/webhooks/whatsapp", response_class=PlainTextResponse)
async def verify_webhook(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
) -> str:
    """Endpoint de verificación de webhook Meta (GET challenge).

    Meta envía un GET para confirmar que el servidor es el destinatario correcto.
    Retorna hub.challenge como plain text si el token es válido.
    """
    if verify_webhook_challenge(hub_mode, hub_verify_token) and hub_challenge:
        logger.info("Webhook Meta verificado correctamente")
        return hub_challenge
    raise AppException(
        code="WEBHOOK_TOKEN_INVALID",
        message="Token de verificación inválido",
        status_code=403,
    )


@router.post("/webhooks/whatsapp")
@limiter.limit(f"{settings.RATE_LIMIT_REQUESTS_PER_MINUTE}/minute")
async def receive_whatsapp_webhook(request: Request) -> JSONResponse:
    """Recibe webhook de Meta, valida firma HMAC-SHA256, resuelve tenant y encola en RQ.

    Flow:
        1. Leer bytes raw (necesario para verificación HMAC)
        2. Validar firma X-Hub-Signature-256
        3. Parse payload Pydantic
        4. Extraer display_phone_number y resolver tenant_id
        5. Encolar process_whatsapp_message en Redis/RQ
        6. Retornar 200 OK inmediato a Meta
    """
    # 1. Leer bytes raw — necesario para HMAC (debe hacerse ANTES de cualquier parse)
    body_bytes = await request.body()

    # 2. Validar firma HMAC-SHA256
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not verify_meta_signature(body_bytes, signature):
        raise AppException(
            code="WEBHOOK_SIGNATURE_INVALID",
            message="Firma de webhook inválida",
            status_code=403,
        )

    # 3. Parse payload Pydantic
    # NOTA: Errores de parse DESPUÉS de verificar la firma retornan 200 (no 400/500)
    # porque Meta reintenta automáticamente en 4xx y nosotros no queremos bucles de retry
    # si hay un cambio de esquema inesperado en la API de Meta.
    try:
        payload = WhatsAppWebhookPayload.model_validate_json(body_bytes)
    except Exception as exc:
        logger.warning("Payload de webhook con formato no reconocido — ignorando", error=str(exc))
        return JSONResponse(content=_success_response())

    # 4. Extraer display_phone_number de forma defensiva
    # Meta puede enviar webhooks de estado (delivery receipts) con entries/changes vacíos
    try:
        display_phone = payload.entry[0].changes[0].value.metadata.display_phone_number
    except (IndexError, AttributeError):
        logger.warning(
            "Webhook sin metadata.display_phone_number — posible webhook de estado, ignorando"
        )
        return JSONResponse(content=_success_response())

    # 4b. Dedup: check if this message ID has already been processed (INFRA-01)
    # Meta guarantees at-least-once delivery — duplicates must be silently discarded.
    # SET NX with 24h TTL: returns True on first delivery, None on duplicate.
    # Skipped if payload has no messages array (status receipts, delivery notifications).
    try:
        message_id = payload.entry[0].changes[0].value.messages[0].id
        dedup_key = f"webhook:dedup:{message_id}"
        acquired = await asyncio.to_thread(
            _get_redis_pool().set, dedup_key, 1, nx=True, ex=86400
        )
        if not acquired:
            logger.info(
                "webhook.duplicate_discarded",
                message_id=message_id,
            )
            return JSONResponse(content=_success_response())
    except (IndexError, AttributeError):
        # No messages array — status receipt or delivery notification; skip dedup
        pass

    # 5. Resolver tenant_id a partir del número de teléfono destino
    tenant = await asyncio.to_thread(get_tenant_by_phone, display_phone)
    if tenant is None:
        # Meta no reintenta en respuestas 200 — retornar OK aunque el tenant no exista
        logger.warning(
            "Tenant no encontrado para webhook entrante",
            phone=display_phone,
        )
        return JSONResponse(content=_success_response())

    # 6. Encolar tarea RQ para procesamiento asíncrono
    # model_dump(by_alias=True): preserva nombres de campo de Meta API (e.g. "from" no "from_")
    # Story 2.2 accederá a messages[0]["from"] — necesita las claves originales del JSON de Meta.
    await asyncio.to_thread(_enqueue_task, payload.model_dump(by_alias=True), str(tenant.tenant_id))

    logger.info(
        "Webhook recibido y encolado exitosamente",
        tenant_id=str(tenant.tenant_id),
        phone=display_phone,
    )

    return JSONResponse(content=_success_response())

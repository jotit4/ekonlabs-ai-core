import asyncio
import tempfile
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, HTTPException, UploadFile, File, status
from fastapi.responses import JSONResponse

import redis as redis_lib

from app.core.config import settings
from app.models.tenant import TenantCreate, TenantRulesUpdate
from app.services.tenant_service import create_tenant, update_tenant_rules
from app.services.rag_service import ingest_document, ingest_text

router = APIRouter()


def _require_admin_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    """Dependency that enforces X-API-Key header on admin endpoints.

    Returns None on success. Raises HTTPException(401) if the header is
    missing or does not match settings.ADMIN_API_KEY.
    """
    if x_api_key is None or x_api_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post("/tenants")
async def create_tenant_endpoint(
    payload: TenantCreate,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    tenant = await asyncio.to_thread(create_tenant, payload)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "status": "success",
            "data": tenant.model_dump(mode="json"),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@router.post("/tenants/{tenant_id}/knowledge")
async def upload_knowledge_endpoint(
    tenant_id: UUID,
    file: UploadFile = File(...),
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Sube un PDF y genera embeddings RAG para el tenant."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")

    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        chunks = await asyncio.to_thread(
            ingest_document, str(tenant_id), tmp_path, file.filename
        )
    finally:
        os.unlink(tmp_path)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "data": {"chunks_inserted": chunks, "filename": file.filename},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@router.post("/tenants/{tenant_id}/knowledge/text")
async def upload_knowledge_text_endpoint(
    tenant_id: UUID,
    source_filename: str = Body(...),
    content: str = Body(...),
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Ingesta texto plano como knowledge base RAG para el tenant."""
    chunks = await asyncio.to_thread(ingest_text, str(tenant_id), content, source_filename)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "data": {"chunks_inserted": chunks, "filename": source_filename},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@router.delete("/admin/dedup-cache")
async def clear_dedup_cache(
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Limpia todos los keys dedup:* de Redis. Útil para resetear entre testeos."""
    r = redis_lib.from_url(settings.REDIS_URL)
    keys = r.keys("dedup:*")
    deleted = r.delete(*keys) if keys else 0
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "data": {"keys_deleted": deleted},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@router.patch("/tenants/{tenant_id}/rules")
async def update_tenant_rules_endpoint(
    tenant_id: UUID,
    payload: TenantRulesUpdate,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    tenant = await asyncio.to_thread(update_tenant_rules, str(tenant_id), payload)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "data": tenant.model_dump(mode="json"),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )

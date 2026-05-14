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
from app.services.thread_state_service import set_thread_paused, set_thread_active

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


@router.delete("/admin/conversations/{tenant_id}/{phone_number}")
async def clear_conversation_history(
    tenant_id: UUID,
    phone_number: str,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Borra el historial de conversación de un número específico. Para uso en testing."""
    from app.core.database import get_supabase_client
    sb = get_supabase_client()
    result = sb.table("conversations").delete().eq("tenant_id", str(tenant_id)).eq("phone_number", phone_number).execute()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "data": {"phone_number": phone_number, "rows_deleted": len(result.data)},
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


@router.get("/tenants/{tenant_id}/conversations/{phone}/context")
async def get_conversation_context(
    tenant_id: UUID,
    phone: str,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Retorna el contexto capturado por el agente para el panel del dashboard."""
    from app.core.database import get_supabase_client
    from app.services.booking_draft_service import get_draft

    sb = get_supabase_client()

    # 1. Datos del paciente registrado
    patient_res = (
        sb.table("patients")
        .select("full_name,dni,obra_social")
        .eq("tenant_id", str(tenant_id))
        .eq("phone_number", phone)
        .limit(1)
        .execute()
    )
    patient = patient_res.data[0] if patient_res.data else None

    # 2. Estado del hilo
    thread_res = (
        sb.table("thread_states")
        .select("status,paused_reason")
        .eq("tenant_id", str(tenant_id))
        .eq("phone_number", phone)
        .limit(1)
        .execute()
    )
    thread = thread_res.data[0] if thread_res.data else None

    # 3. Draft de booking en curso desde Redis
    draft = await asyncio.to_thread(get_draft, str(tenant_id), phone)

    # Mapear paused_reason a texto legible
    paused_reason = thread.get("paused_reason") if thread else None
    current_block = None
    if paused_reason == "low_confidence":
        current_block = "Baja confianza — requiere intervención"
    elif paused_reason == "human_takeover":
        current_block = "Humano en control"

    # Intent inferido desde draft
    detected_intent = None
    if draft and (draft.get("selected_service_name") or draft.get("booked_slot")):
        detected_intent = "agendar_turno"

    # Slot reservado o seleccionado
    slot_requested = None
    if draft:
        booked = draft.get("booked_slot")
        if isinstance(booked, dict):
            slot_requested = booked.get("display") or booked.get("start")

    context = {
        "patient_name": (patient or {}).get("full_name") or (draft or {}).get("patient_name"),
        "phone_number": phone,
        "detected_intent": detected_intent,
        "dni": (patient or {}).get("dni") or (draft or {}).get("patient_dni"),
        "service_requested": (draft or {}).get("selected_service_name"),
        "slot_requested": slot_requested,
        "availability_info": None,
        "obra_social": (patient or {}).get("obra_social"),
        "current_block": current_block,
        "is_resolved": False,
    }

    return JSONResponse(status_code=status.HTTP_200_OK, content=context)


@router.post("/tenants/{tenant_id}/conversations/{phone}/takeover")
async def takeover_conversation(
    tenant_id: UUID,
    phone: str,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Pausa el agente IA en el hilo dado (human_takeover). Llamado desde el dashboard."""
    await asyncio.to_thread(set_thread_paused, str(tenant_id), phone, "human_takeover")
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ok", "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}},
    )


@router.post("/tenants/{tenant_id}/conversations/{phone}/release")
async def release_conversation(
    tenant_id: UUID,
    phone: str,
    _: None = Depends(_require_admin_api_key),
) -> JSONResponse:
    """Reactiva el agente IA en el hilo dado. Llamado desde el dashboard."""
    await asyncio.to_thread(set_thread_active, str(tenant_id), phone)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ok", "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}},
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

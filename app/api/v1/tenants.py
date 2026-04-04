import asyncio
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.models.tenant import TenantCreate, TenantRulesUpdate
from app.services.tenant_service import create_tenant, update_tenant_rules

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

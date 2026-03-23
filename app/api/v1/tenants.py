import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.models.tenant import TenantCreate, TenantRulesUpdate
from app.services.tenant_service import create_tenant, update_tenant_rules

router = APIRouter()


@router.post("/tenants")
async def create_tenant_endpoint(payload: TenantCreate) -> JSONResponse:
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
    tenant_id: UUID, payload: TenantRulesUpdate
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

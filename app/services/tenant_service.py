from app.core.database import get_supabase_client
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.models.tenant import TenantCreate, TenantResponse, TenantRulesUpdate

logger = get_logger(__name__)

# Código PostgreSQL para unique_violation
_PG_UNIQUE_VIOLATION = "23505"


def _is_duplicate_error(exc: Exception) -> bool:
    """Detecta unique_violation de PostgreSQL de forma robusta."""
    exc_str = str(exc)
    # postgrest-py incluye el código PostgreSQL en el mensaje de error
    if _PG_UNIQUE_VIOLATION in exc_str:
        return True
    exc_lower = exc_str.lower()
    return "duplicate" in exc_lower or "unique" in exc_lower


def _normalize_row(row: dict) -> dict:
    """Compatibilidad defensiva: normaliza 'id' → 'tenant_id' si aplica. No muta el original."""
    if "tenant_id" not in row and "id" in row:
        return {**{k: v for k, v in row.items() if k != "id"}, "tenant_id": row["id"]}
    return row


def _build_update_payload(update: TenantRulesUpdate) -> dict:
    """Construye el dict de actualización excluyendo campos None.

    Nota: `rules` en TenantRulesUpdate es Optional — si es None, no se incluye en el payload.
    El merge de rules existentes debe hacerse ANTES de llamar a esta función.
    """
    return update.model_dump(exclude_none=True)


def get_tenant_config(tenant_id: str) -> TenantResponse:
    """Recupera la configuración completa de un Tenant (incluye system_prompt y rules)."""
    client = get_supabase_client()

    try:
        result = (
            client.table("tenants")
            .select("*")
            .eq("tenant_id", tenant_id)
            .execute()
        )
    except Exception as exc:
        logger.warning("Failed to get tenant config", tenant_id=tenant_id, error=str(exc))
        raise AppException(
            code="TENANT_GET_FAILED",
            message="No se pudo obtener la configuración del tenant",
            status_code=500,
        ) from exc

    data = getattr(result, "data", None)
    if not data:
        raise AppException(
            code="TENANT_NOT_FOUND",
            message=f"Tenant {tenant_id} no encontrado",
            status_code=404,
        )

    row = _normalize_row(data[0] if isinstance(data, list) else data)

    try:
        return TenantResponse.model_validate(row)
    except Exception as exc:
        logger.warning("Invalid tenant row shape", tenant_id=tenant_id, error=str(exc))
        raise AppException(
            code="TENANT_GET_FAILED",
            message="La respuesta de base de datos no cumple el contrato esperado",
            status_code=500,
        ) from exc


def update_tenant_rules(tenant_id: str, update: TenantRulesUpdate) -> TenantResponse:
    """Actualiza system_prompt_override y/o rules de un Tenant existente.

    Si `update.rules` está presente, hace shallow merge con las rules existentes
    (spec: NO reemplazar todo el objeto JSONB). Eleva TENANT_NOT_FOUND si el
    tenant no existe antes de intentar el UPDATE.
    """
    payload = _build_update_payload(update)

    # H2 fix: si se proveen rules, mergearlas con las existentes (shallow merge)
    if update.rules is not None:
        current = get_tenant_config(tenant_id)  # raise TENANT_NOT_FOUND si no existe
        payload["rules"] = {**current.rules, **update.rules}

    if not payload:
        # Nada que actualizar — retornar configuración actual
        return get_tenant_config(tenant_id)

    client = get_supabase_client()

    try:
        result = (
            client.table("tenants")
            .update(payload)
            .eq("tenant_id", tenant_id)
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "Failed to update tenant rules", tenant_id=tenant_id, error=str(exc)
        )
        raise AppException(
            code="TENANT_UPDATE_FAILED",
            message="No se pudo actualizar las reglas del tenant",
            status_code=500,
        ) from exc

    data = getattr(result, "data", None)
    if not data:
        raise AppException(
            code="TENANT_NOT_FOUND",
            message=f"Tenant {tenant_id} no encontrado",
            status_code=404,
        )

    row = _normalize_row(data[0] if isinstance(data, list) else data)

    try:
        return TenantResponse.model_validate(row)
    except Exception as exc:
        logger.warning(
            "Invalid tenant row shape after update", tenant_id=tenant_id, error=str(exc)
        )
        raise AppException(
            code="TENANT_UPDATE_FAILED",
            message="La respuesta de base de datos no cumple el contrato esperado",
            status_code=500,
        ) from exc


def create_tenant(tenant_create: TenantCreate) -> TenantResponse:
    client = get_supabase_client()
    payload = tenant_create.model_dump()

    try:
        result = client.table("tenants").insert(payload).execute()
    except Exception as exc:
        logger.warning("Failed to create tenant", error=str(exc))

        if _is_duplicate_error(exc):
            raise AppException(
                code="TENANT_DUPLICATE",
                message="Ya existe un tenant con ese número de WhatsApp",
                status_code=409,
            ) from exc

        raise AppException(
            code="TENANT_CREATE_FAILED",
            message="No se pudo crear el tenant",
            status_code=500,
        ) from exc

    data = getattr(result, "data", None)
    if not data:
        raise AppException(
            code="TENANT_CREATE_FAILED",
            message="Supabase no devolvió datos del tenant creado",
            status_code=500,
        )

    row = _normalize_row(data[0] if isinstance(data, list) else data)

    try:
        return TenantResponse.model_validate(row)
    except Exception as exc:
        logger.warning("Invalid tenant response shape from database", row=row, error=str(exc))
        raise AppException(
            code="TENANT_CREATE_FAILED",
            message="La respuesta de base de datos no cumple el contrato esperado",
            status_code=500,
        ) from exc

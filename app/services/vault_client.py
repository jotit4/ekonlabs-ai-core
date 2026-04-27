"""Credential resolver — moves service-account JSON out of JSONB plaintext.

Resolution order for a TenantConfig:
  1. If `calendar_credentials_ref` is set → look up from Vault or env var.
  2. Fall back to `calendar_credentials` dict (legacy; deprecated).

Vault lookup (Supabase supabase_vault extension, when available):
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = :ref;

Env-var fallback (always available):
    The value of the env var whose name equals `calendar_credentials_ref`.
    The env var must contain the full service-account JSON string.

During the credential migration window both paths coexist so no tenant
loses access while `calendar_credentials` is being drained to NULL.
"""
from __future__ import annotations

import json
import os

from app.core.logging import get_logger

logger = get_logger(__name__)


def resolve_calendar_credentials(
    calendar_credentials_ref: str | None,
    calendar_credentials_legacy: dict | None,
) -> dict:
    """Return the service-account credentials dict for a tenant.

    Raises:
        ValueError: if neither source yields a usable credential dict.
    """
    if isinstance(calendar_credentials_ref, str) and calendar_credentials_ref:
        creds = _resolve_ref(calendar_credentials_ref)
        if creds:
            return creds

    if isinstance(calendar_credentials_legacy, dict) and calendar_credentials_legacy:
        logger.warning(
            "vault_client.using_legacy_credentials",
            note="calendar_credentials JSONB is deprecated — migrate to calendar_credentials_ref",
        )
        return calendar_credentials_legacy

    raise ValueError(
        "No calendar credentials available. "
        "Set calendar_credentials_ref (env var or Vault) or calendar_credentials (legacy)."
    )


def _resolve_ref(ref: str) -> dict | None:
    """Try Vault first, then env-var fallback. Returns None if neither works."""
    creds = _from_vault(ref)
    if creds is not None:
        return creds
    return _from_env(ref)


def _from_vault(ref: str) -> dict | None:
    """Query Supabase Vault for the secret named `ref`. Returns None if unavailable."""
    try:
        import psycopg2
        from app.services.rag_service import _get_pool  # reuse existing pg pool

        pool = _get_pool()
        conn = pool.getconn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %s LIMIT 1",
                        (ref,),
                    )
                    row = cur.fetchone()
        finally:
            pool.putconn(conn)

        if not row:
            return None

        secret_str = row[0]
        parsed = json.loads(secret_str)
        logger.info("vault_client.resolved_from_vault", ref=ref)
        return parsed

    except Exception as exc:
        logger.debug("vault_client.vault_unavailable", ref=ref, reason=str(exc))
        return None


def _from_env(ref: str) -> dict | None:
    """Read the env var named `ref` and parse it as JSON."""
    if not isinstance(ref, str):
        return None
    raw = os.environ.get(ref)
    if not raw:
        logger.warning("vault_client.env_var_not_found", ref=ref)
        return None
    try:
        parsed = json.loads(raw)
        logger.info("vault_client.resolved_from_env", ref=ref)
        return parsed
    except json.JSONDecodeError as exc:
        logger.error("vault_client.env_var_invalid_json", ref=ref, error=str(exc))
        return None

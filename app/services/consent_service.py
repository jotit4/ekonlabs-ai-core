"""Consent service — Ley 25.326 ARCO compliance (F0.3).

Stores and checks patient opt-in consent in patient_consents table.
phone_hash = hash_pii(phone) — raw phone is never written to this table.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.database import get_supabase_client
from app.core.logging import get_logger
from app.logging.processors import hash_pii

logger = get_logger(__name__)


def has_active_consent(tenant_id: str, phone_number: str) -> bool:
    """Return True if an active (non-revoked) consent record exists for this patient."""
    try:
        phone_hash = hash_pii(phone_number)
        client = get_supabase_client()
        response = (
            client.table("patient_consents")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("phone_hash", phone_hash)
            .is_("revoked_at", "null")
            .limit(1)
            .execute()
        )
        return bool(response.data)
    except Exception as exc:
        logger.error(
            "consent_service.has_active_consent.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        # Fail-safe: on DB error, treat as no consent (block) rather than allow through
        return False


def record_consent(tenant_id: str, phone_number: str, version: str = "1.0") -> bool:
    """Insert a new consent record. Returns True on success, False on error."""
    try:
        phone_hash = hash_pii(phone_number)
        client = get_supabase_client()
        client.table("patient_consents").upsert(
            {
                "phone_hash": phone_hash,
                "tenant_id": tenant_id,
                "consent_at": datetime.now(timezone.utc).isoformat(),
                "version": version,
            },
            on_conflict="phone_hash,tenant_id",
        ).execute()
        logger.info(
            "consent_service.consent_recorded",
            tenant_id=tenant_id,
            version=version,
        )
        return True
    except Exception as exc:
        logger.error(
            "consent_service.record_consent.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        return False


def revoke_consent(tenant_id: str, phone_number: str) -> bool:
    """Mark consent as revoked (ARCO right to erasure). Returns True on success."""
    try:
        phone_hash = hash_pii(phone_number)
        client = get_supabase_client()
        client.table("patient_consents").update(
            {"revoked_at": datetime.now(timezone.utc).isoformat()}
        ).eq("tenant_id", tenant_id).eq("phone_hash", phone_hash).is_(
            "revoked_at", "null"
        ).execute()
        logger.info("consent_service.consent_revoked", tenant_id=tenant_id)
        return True
    except Exception as exc:
        logger.error(
            "consent_service.revoke_consent.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        return False

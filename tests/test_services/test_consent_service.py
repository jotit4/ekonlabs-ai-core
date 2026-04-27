"""Tests para app/services/consent_service.py (F0.3 — Ley 25.326)."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.consent_service import has_active_consent, record_consent, revoke_consent

_TENANT = "tenant-uuid-f03"
_PHONE = "+5491187654321"


def _make_supabase(data=None, raise_exc=None):
    client = MagicMock()
    chain = client.table.return_value.select.return_value.eq.return_value.eq.return_value
    if raise_exc:
        chain.is_.return_value.limit.return_value.execute.side_effect = raise_exc
    else:
        chain.is_.return_value.limit.return_value.execute.return_value.data = data or []
    return client


class TestHasActiveConsent:
    def test_returns_true_when_record_exists(self):
        client = _make_supabase(data=[{"id": "some-uuid"}])
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert has_active_consent(_TENANT, _PHONE) is True

    def test_returns_false_when_no_record(self):
        client = _make_supabase(data=[])
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert has_active_consent(_TENANT, _PHONE) is False

    def test_returns_false_on_db_error(self):
        client = _make_supabase(raise_exc=RuntimeError("db down"))
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert has_active_consent(_TENANT, _PHONE) is False

    def test_uses_phone_hash_not_raw_phone(self):
        client = _make_supabase(data=[])
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            has_active_consent(_TENANT, _PHONE)

        table_chain = client.table.return_value.select.return_value.eq
        first_eq_call_args = table_chain.call_args_list[0]
        # First .eq() is tenant_id, second is phone_hash — phone_hash must NOT be the raw phone
        second_eq_call_args = table_chain.return_value.eq.call_args_list[0]
        assert second_eq_call_args.args[1] != _PHONE
        assert second_eq_call_args.args[1].startswith("pii:")


class TestRecordConsent:
    def test_returns_true_on_success(self):
        client = MagicMock()
        client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert record_consent(_TENANT, _PHONE) is True

    def test_upserts_with_correct_fields(self):
        client = MagicMock()
        client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            record_consent(_TENANT, _PHONE)

        upsert_call = client.table.return_value.upsert.call_args
        payload = upsert_call.args[0]
        assert payload["tenant_id"] == _TENANT
        assert payload["phone_hash"].startswith("pii:")
        assert payload["phone_hash"] != _PHONE
        assert "consent_at" in payload
        assert payload["version"] == "1.0"

    def test_returns_false_on_db_error(self):
        client = MagicMock()
        client.table.return_value.upsert.return_value.execute.side_effect = RuntimeError("db down")
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert record_consent(_TENANT, _PHONE) is False

    def test_accepts_custom_version(self):
        client = MagicMock()
        client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            record_consent(_TENANT, _PHONE, version="2.0")

        payload = client.table.return_value.upsert.call_args.args[0]
        assert payload["version"] == "2.0"


class TestRevokeConsent:
    def _make_revoke_client(self, raise_exc=None):
        client = MagicMock()
        chain = (
            client.table.return_value
            .update.return_value
            .eq.return_value
            .eq.return_value
            .is_.return_value
        )
        if raise_exc:
            chain.execute.side_effect = raise_exc
        else:
            chain.execute.return_value = MagicMock()
        return client

    def test_returns_true_on_success(self):
        client = self._make_revoke_client()
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert revoke_consent(_TENANT, _PHONE) is True

    def test_sets_revoked_at_not_null(self):
        client = self._make_revoke_client()
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            revoke_consent(_TENANT, _PHONE)

        update_payload = client.table.return_value.update.call_args.args[0]
        assert "revoked_at" in update_payload
        assert update_payload["revoked_at"] is not None

    def test_returns_false_on_db_error(self):
        client = self._make_revoke_client(raise_exc=RuntimeError("db down"))
        with patch("app.services.consent_service.get_supabase_client", return_value=client):
            assert revoke_consent(_TENANT, _PHONE) is False

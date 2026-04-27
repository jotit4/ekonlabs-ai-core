"""Tests para app/services/vault_client.py (F0.1 — secret management)."""
import json
import os
from unittest.mock import MagicMock, patch

import pytest

from app.services.vault_client import resolve_calendar_credentials


_CREDS = {"type": "service_account", "project_id": "test-project"}


class TestResolveCalendarCredentials:
    def test_returns_legacy_dict_when_no_ref(self):
        result = resolve_calendar_credentials(None, _CREDS)
        assert result == _CREDS

    def test_ignores_none_legacy_and_raises(self):
        with pytest.raises(ValueError):
            resolve_calendar_credentials(None, None)

    def test_ignores_empty_legacy_dict_and_raises(self):
        with pytest.raises(ValueError):
            resolve_calendar_credentials(None, {})

    def test_non_string_ref_falls_through_to_legacy(self):
        mock_ref = MagicMock()  # simulates unmocked TenantConfig attribute
        result = resolve_calendar_credentials(mock_ref, _CREDS)
        assert result == _CREDS

    def test_non_dict_legacy_raises(self):
        with pytest.raises(ValueError):
            resolve_calendar_credentials(None, MagicMock())

    def test_resolves_from_env_var(self, monkeypatch):
        monkeypatch.setenv("MY_CREDS_REF", json.dumps(_CREDS))
        with patch("app.services.vault_client._from_vault", return_value=None):
            result = resolve_calendar_credentials("MY_CREDS_REF", None)
        assert result == _CREDS

    def test_env_var_missing_raises(self):
        with (
            patch("app.services.vault_client._from_vault", return_value=None),
            patch.dict(os.environ, {}, clear=False),
        ):
            os.environ.pop("NONEXISTENT_CREDS_REF", None)
            with pytest.raises(ValueError):
                resolve_calendar_credentials("NONEXISTENT_CREDS_REF", None)

    def test_vault_result_preferred_over_env(self, monkeypatch):
        vault_creds = {**_CREDS, "from": "vault"}
        monkeypatch.setenv("MY_REF", json.dumps(_CREDS))
        with patch("app.services.vault_client._from_vault", return_value=vault_creds):
            result = resolve_calendar_credentials("MY_REF", None)
        assert result["from"] == "vault"

    def test_vault_failure_falls_back_to_env(self, monkeypatch):
        monkeypatch.setenv("MY_REF", json.dumps(_CREDS))
        with patch("app.services.vault_client._from_vault", return_value=None):
            result = resolve_calendar_credentials("MY_REF", None)
        assert result == _CREDS

    def test_env_invalid_json_logs_and_raises(self, monkeypatch):
        monkeypatch.setenv("BAD_JSON_REF", "not-json{{{")
        with patch("app.services.vault_client._from_vault", return_value=None):
            with pytest.raises(ValueError):
                resolve_calendar_credentials("BAD_JSON_REF", None)

    def test_ref_takes_priority_over_legacy(self, monkeypatch):
        env_creds = {**_CREDS, "source": "env"}
        monkeypatch.setenv("PRIO_REF", json.dumps(env_creds))
        with patch("app.services.vault_client._from_vault", return_value=None):
            result = resolve_calendar_credentials("PRIO_REF", _CREDS)
        assert result["source"] == "env"

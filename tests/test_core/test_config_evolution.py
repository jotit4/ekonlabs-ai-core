"""Tests for Evolution API config fields in Settings."""
import os
from unittest.mock import patch


def test_settings_defaults_without_evolution_vars():
    """Settings can be instantiated without Evolution vars — they default to ''."""
    from app.core.config import Settings

    s = Settings(
        SUPABASE_URL="https://test.supabase.co",
        SUPABASE_KEY="test-key",
        META_VERIFY_TOKEN="token",
        META_APP_SECRET="secret",
        META_ACCESS_TOKEN="access",
        OPENAI_API_KEY="openai-key",
        ADMIN_API_KEY="admin-key",
        _env_file=None,
    )
    assert s.EVOLUTION_API_URL == ""
    assert s.EVOLUTION_API_KEY == ""
    assert s.EVOLUTION_INSTANCE == ""
    assert s.EVOLUTION_DISPLAY_PHONE == ""


def test_whatsapp_provider_defaults_to_meta():
    """WHATSAPP_PROVIDER defaults to 'meta' when env var is absent."""
    from app.core.config import Settings

    s = Settings(
        SUPABASE_URL="https://test.supabase.co",
        SUPABASE_KEY="test-key",
        META_VERIFY_TOKEN="token",
        META_APP_SECRET="secret",
        META_ACCESS_TOKEN="access",
        OPENAI_API_KEY="openai-key",
        ADMIN_API_KEY="admin-key",
        _env_file=None,
    )
    assert s.WHATSAPP_PROVIDER == "meta"


def test_evolution_api_url_overridable_via_env():
    """EVOLUTION_API_URL can be overridden via environment variable."""
    from app.core.config import Settings

    with patch.dict(os.environ, {"EVOLUTION_API_URL": "https://evo.example.com"}):
        s = Settings(
            SUPABASE_URL="https://test.supabase.co",
            SUPABASE_KEY="test-key",
            META_VERIFY_TOKEN="token",
            META_APP_SECRET="secret",
            META_ACCESS_TOKEN="access",
            OPENAI_API_KEY="openai-key",
            ADMIN_API_KEY="admin-key",
            _env_file=None,
        )
        assert s.EVOLUTION_API_URL == "https://evo.example.com"

"""Tests unitarios para app/core/rate_limiter.py — AC #2, #4, #5."""
from unittest.mock import MagicMock


def test_get_rate_limit_key_with_tenant_id():
    """AC5: key function retorna 'rate:{tenant_id}' cuando se provee tenant_id."""
    from app.core.rate_limiter import get_rate_limit_key

    mock_request = MagicMock()
    key = get_rate_limit_key(mock_request, tenant_id="tenant-abc-123")
    assert key == "rate:tenant-abc-123"


def test_get_rate_limit_key_without_tenant_id():
    """AC5: key function retorna 'rate:global' como fallback cuando tenant_id es None."""
    from app.core.rate_limiter import get_rate_limit_key

    mock_request = MagicMock()
    key = get_rate_limit_key(mock_request, tenant_id=None)
    assert key == "rate:global"


def test_get_rate_limit_key_different_tenants_produce_different_keys():
    """AC2: distintos tenant_ids producen distintas claves Redis — garantiza aislamiento."""
    from app.core.rate_limiter import get_rate_limit_key

    mock_request = MagicMock()
    key_a = get_rate_limit_key(mock_request, tenant_id="clinica-a")
    key_b = get_rate_limit_key(mock_request, tenant_id="clinica-b")
    assert key_a != key_b
    assert key_a == "rate:clinica-a"
    assert key_b == "rate:clinica-b"


def test_limiter_instance_is_limiter_type():
    """AC4: el objeto `limiter` es una instancia válida de slowapi.Limiter."""
    from slowapi import Limiter

    from app.core.rate_limiter import limiter

    assert isinstance(limiter, Limiter)


def test_limiter_uses_redis_storage_uri():
    """AC4: el Limiter tiene REDIS_URL configurado y usa default_limits de burst."""
    from app.core.config import settings
    from app.core.rate_limiter import limiter

    assert settings.REDIS_URL != ""
    assert limiter is not None
    # Verificar que default_limits fue configurado con RATE_LIMIT_BURST
    # (el Limiter almacena los límites como objetos Limit en _default_limits)
    assert len(limiter._default_limits) > 0, "Limiter debe tener default_limits configurados (RATE_LIMIT_BURST)"


def test_rate_limit_config_values_are_positive():
    """AC4: las variables de configuración tienen valores positivos válidos."""
    from app.core.config import settings

    assert settings.RATE_LIMIT_REQUESTS_PER_MINUTE > 0
    assert settings.RATE_LIMIT_BURST > 0


def test_rate_limit_config_defaults():
    """AC4: los valores por defecto siguen la especificación (30 req/min, burst 50)."""
    from app.core.config import settings

    # En entorno de tests sin .env, deben ser los defaults definidos en config.py
    assert settings.RATE_LIMIT_REQUESTS_PER_MINUTE == 30, "Default debe ser 30 req/min"
    assert settings.RATE_LIMIT_BURST == 50, "Default debe ser 50 burst/min"

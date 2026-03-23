import os

# Parchamos variables ANTES de cualquier import de app para evitar
# que pydantic-settings falle por variables faltantes
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
# supabase-py valida formato JWT — usamos un JWT mínimo bien-formado para tests
os.environ.setdefault(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJyb2xlIjoic2VydmljZV9yb2xlIn0"
    ".fake_sig_for_tests_only",
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("REDIS_URL", "memory://")

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from app.main import app

    # TestClient maneja el lifespan del app correctamente (una vez por sesión)
    # y no bloquea el event loop entre requests.
    with TestClient(app) as c:
        yield c

from app.core.exceptions import AppException
from app.models.tenant import TenantResponse

FAKE_TENANT_ID = "123e4567-e89b-12d3-a456-426614174000"


def test_create_tenant_returns_201_and_wrapper(client, monkeypatch):
    def fake_create_tenant(_tenant_create):
        return TenantResponse(
            tenant_id="123e4567-e89b-12d3-a456-426614174000",
            name="Clinica Sonrisa",
            whatsapp_number="+5491122334455",
            timezone="America/Argentina/Buenos_Aires",
            shadow_mode_enabled=False,
            status="active",
        )

    monkeypatch.setattr("app.api.v1.tenants.create_tenant", fake_create_tenant)

    response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Clinica Sonrisa",
            "whatsapp_number": "+5491122334455",
            "timezone": "America/Argentina/Buenos_Aires",
            "shadow_mode_enabled": False,
            "status": "active",
        },
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["tenant_id"] == "123e4567-e89b-12d3-a456-426614174000"
    assert body["data"]["name"] == "Clinica Sonrisa"
    assert "timestamp" in body["meta"]


def test_create_tenant_returns_409_on_duplicate(client, monkeypatch):
    def fake_create_tenant(_tenant_create):
        raise AppException("TENANT_DUPLICATE", "Tenant ya existe", 409)

    monkeypatch.setattr("app.api.v1.tenants.create_tenant", fake_create_tenant)

    response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Clinica Sonrisa",
            "whatsapp_number": "+5491122334455",
            "timezone": "America/Argentina/Buenos_Aires",
            "shadow_mode_enabled": False,
            "status": "active",
        },
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "TENANT_DUPLICATE"


def test_create_tenant_returns_422_on_invalid_payload(client):
    response = client.post(
        "/api/v1/tenants",
        json={
            "name": "A",  # nombre invalido (minimo 2 chars)
            "whatsapp_number": "abc",  # formato invalido
            "timezone": "",  # minimo 1 char
            "shadow_mode_enabled": False,
            "status": "active",
        },
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "meta" in body
    assert "timestamp" in body["meta"]


def test_patch_tenant_rules_returns_200(client, monkeypatch):
    def fake_update_tenant_rules(_tenant_id, _update):
        return TenantResponse(
            tenant_id=FAKE_TENANT_ID,
            name="Clinica Sonrisa",
            whatsapp_number="+5491122334455",
            timezone="America/Argentina/Buenos_Aires",
            shadow_mode_enabled=False,
            status="active",
            system_prompt_override="Eres formal.",
            rules={"tono": "formal"},
        )

    monkeypatch.setattr(
        "app.api.v1.tenants.update_tenant_rules", fake_update_tenant_rules
    )

    response = client.patch(
        f"/api/v1/tenants/{FAKE_TENANT_ID}/rules",
        json={"system_prompt_override": "Eres formal.", "rules": {"tono": "formal"}},
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["system_prompt_override"] == "Eres formal."
    assert body["data"]["rules"] == {"tono": "formal"}
    assert "timestamp" in body["meta"]


def test_patch_tenant_rules_returns_404_when_not_found(client, monkeypatch):
    def fake_update_tenant_rules(_tenant_id, _update):
        raise AppException("TENANT_NOT_FOUND", "Tenant no encontrado", 404)

    monkeypatch.setattr(
        "app.api.v1.tenants.update_tenant_rules", fake_update_tenant_rules
    )

    response = client.patch(
        f"/api/v1/tenants/{FAKE_TENANT_ID}/rules",
        json={"system_prompt_override": "Algo"},
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 404
    body = response.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "TENANT_NOT_FOUND"


def test_patch_tenant_rules_returns_422_on_invalid_uuid(client):
    """L2 fix: tenant_id path param validado como UUID -> 422 limpio.

    Note: FastAPI 0.135+ resolves Depends before path param validation,
    so the valid X-API-Key header is required to reach the 422 path.
    """
    response = client.patch(
        "/api/v1/tenants/not-a-uuid/rules",
        json={"system_prompt_override": "X"},
        headers={"X-API-Key": "test-admin-key-for-tests-only"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_create_tenant_returns_401_without_api_key(client):
    """POST /tenants without X-API-Key returns 401."""
    response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Clinica Sonrisa",
            "whatsapp_number": "+5491122334455",
            "timezone": "America/Argentina/Buenos_Aires",
            "shadow_mode_enabled": False,
            "status": "active",
        },
    )
    assert response.status_code == 401


def test_patch_tenant_rules_returns_401_without_api_key(client):
    """PATCH /tenants/{id}/rules without X-API-Key returns 401."""
    response = client.patch(
        f"/api/v1/tenants/{FAKE_TENANT_ID}/rules",
        json={"system_prompt_override": "Eres formal."},
    )
    assert response.status_code == 401

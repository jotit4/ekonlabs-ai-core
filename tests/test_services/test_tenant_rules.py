"""Tests para get_tenant_config() y update_tenant_rules() — Story 1.4."""
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_TENANT_ID = "123e4567-e89b-12d3-a456-426614174000"

FAKE_ROW = {
    "tenant_id": FAKE_TENANT_ID,
    "name": "Clínica Sonrisa",
    "whatsapp_number": "+5491122334455",
    "timezone": "America/Argentina/Buenos_Aires",
    "shadow_mode_enabled": False,
    "status": "active",
    "system_prompt_override": "Eres un recepcionista formal y empático.",
    "rules": {"tono": "formal", "idioma": "español"},
}


def _make_supabase_mock(monkeypatch, data):
    """Inyecta un Supabase client mockeado que retorna `data` en .execute().

    Expone `last_update_payload` en FakeClient para verificar qué se envió a update().
    """

    class FakeExecuteResult:
        def __init__(self, rows):
            self.data = rows

    class FakeFilterBuilder:
        def __init__(self, rows):
            self._rows = rows

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            return FakeExecuteResult(self._rows)

    class FakeTable:
        def __init__(self, client_ref, rows):
            self._client = client_ref
            self._rows = rows

        def select(self, *_args, **_kwargs):
            return FakeFilterBuilder(self._rows)

        def update(self, payload, **_kwargs):
            # M1 fix: capturar el payload para poder inspeccionarlo en tests
            self._client.last_update_payload = payload
            return FakeFilterBuilder(self._rows)

    class FakeClient:
        def __init__(self, rows):
            self._rows = rows
            self.last_update_payload = None

        def table(self, _name):
            return FakeTable(self, self._rows)

    fake_client = FakeClient(data)
    monkeypatch.setattr(
        "app.services.tenant_service.get_supabase_client", lambda: fake_client
    )
    return fake_client


# ---------------------------------------------------------------------------
# get_tenant_config
# ---------------------------------------------------------------------------


def test_get_tenant_config_returns_tenant_with_rules(monkeypatch):
    _make_supabase_mock(monkeypatch, [FAKE_ROW])

    from app.services.tenant_service import get_tenant_config

    result = get_tenant_config(FAKE_TENANT_ID)

    assert result.tenant_id.hex.replace("-", "") == FAKE_TENANT_ID.replace("-", "")
    assert result.system_prompt_override == "Eres un recepcionista formal y empático."
    assert result.rules == {"tono": "formal", "idioma": "español"}


def test_get_tenant_config_raises_404_when_not_found(monkeypatch):
    _make_supabase_mock(monkeypatch, [])  # DB retorna lista vacía

    from app.core.exceptions import AppException
    from app.services.tenant_service import get_tenant_config

    with pytest.raises(AppException) as exc_info:
        get_tenant_config(FAKE_TENANT_ID)

    assert exc_info.value.code == "TENANT_NOT_FOUND"
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# update_tenant_rules
# ---------------------------------------------------------------------------


def test_update_tenant_rules_persists_system_prompt(monkeypatch):
    """Verifica que el payload enviado a Supabase contiene system_prompt_override."""
    updated_row = {**FAKE_ROW, "system_prompt_override": "Nuevo prompt."}
    fake_client = _make_supabase_mock(monkeypatch, [updated_row])

    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import update_tenant_rules

    update = TenantRulesUpdate(system_prompt_override="Nuevo prompt.")
    result = update_tenant_rules(FAKE_TENANT_ID, update)

    # Verificar retorno
    assert result.system_prompt_override == "Nuevo prompt."

    # M1 fix: verificar el payload real enviado a Supabase
    assert fake_client.last_update_payload is not None
    assert fake_client.last_update_payload["system_prompt_override"] == "Nuevo prompt."


def test_update_tenant_rules_does_not_wipe_rules_when_only_prompt_updated(monkeypatch):
    """H1 fix: PATCH con solo system_prompt_override NO debe incluir rules en el payload."""
    updated_row = {**FAKE_ROW, "system_prompt_override": "Solo el prompt."}
    fake_client = _make_supabase_mock(monkeypatch, [updated_row])

    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import update_tenant_rules

    # Solo system_prompt_override, sin rules → rules=None
    update = TenantRulesUpdate(system_prompt_override="Solo el prompt.")
    update_tenant_rules(FAKE_TENANT_ID, update)

    # El payload NO debe contener 'rules' — no debe wiparse el JSONB
    assert fake_client.last_update_payload is not None
    assert "rules" not in fake_client.last_update_payload


def test_update_tenant_rules_merges_with_existing_rules(monkeypatch):
    """H2 fix: PATCH con rules hace shallow merge con las existentes."""
    existing_row = {
        **FAKE_ROW,
        "rules": {"tono": "formal", "idioma": "español"},
    }
    # La segunda llamada (UPDATE) retorna el row con rules mergeadas
    merged_row = {
        **FAKE_ROW,
        "rules": {"tono": "empático", "idioma": "español"},  # tono override, idioma preservado
    }

    # get_tenant_config (primer SELECT) retorna existing_row
    # update (segundo UPDATE) retorna merged_row
    call_count = {"n": 0}
    responses = [[existing_row], [merged_row]]

    class FakeExecuteResult:
        def __init__(self, rows):
            self.data = rows

    class FakeFilterBuilder:
        def __init__(self, rows):
            self._rows = rows

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            return FakeExecuteResult(self._rows)

    class FakeTable:
        def __init__(self, client_ref):
            self._client = client_ref

        def select(self, *_args, **_kwargs):
            rows = responses[call_count["n"]]
            call_count["n"] += 1
            return FakeFilterBuilder(rows)

        def update(self, payload, **_kwargs):
            self._client.last_update_payload = payload
            rows = responses[call_count["n"]]
            call_count["n"] += 1
            return FakeFilterBuilder(rows)

    class FakeClient:
        last_update_payload = None

        def table(self, _name):
            return FakeTable(self)

    fake_client = FakeClient()
    monkeypatch.setattr(
        "app.services.tenant_service.get_supabase_client", lambda: fake_client
    )

    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import update_tenant_rules

    update = TenantRulesUpdate(rules={"tono": "empático"})
    result = update_tenant_rules(FAKE_TENANT_ID, update)

    # El payload enviado debe tener las rules mergeadas, no solo las nuevas
    assert fake_client.last_update_payload is not None
    merged = fake_client.last_update_payload["rules"]
    assert merged["tono"] == "empático"    # overridden
    assert merged["idioma"] == "español"   # preserved from existing

    # El resultado final también debe reflejar el merge
    assert result.rules["idioma"] == "español"


def test_update_tenant_rules_raises_404_when_tenant_missing(monkeypatch):
    _make_supabase_mock(monkeypatch, [])  # No rows → tenant no existe

    from app.core.exceptions import AppException
    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import update_tenant_rules

    update = TenantRulesUpdate(system_prompt_override="Algo")
    with pytest.raises(AppException) as exc_info:
        update_tenant_rules(FAKE_TENANT_ID, update)

    assert exc_info.value.code == "TENANT_NOT_FOUND"
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# _build_update_payload — tests unitarios puros
# ---------------------------------------------------------------------------


def test_build_update_payload_excludes_none_fields():
    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import _build_update_payload

    # Solo rules explícitas, sin system_prompt_override
    update = TenantRulesUpdate(rules={"tono": "formal"})
    payload = _build_update_payload(update)

    assert "rules" in payload
    assert payload["rules"] == {"tono": "formal"}
    assert "system_prompt_override" not in payload


def test_build_update_payload_excludes_rules_when_none():
    """H1 fix: rules=None (default) NO debe aparecer en el payload."""
    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import _build_update_payload

    update = TenantRulesUpdate(system_prompt_override="Solo prompt")
    payload = _build_update_payload(update)

    assert payload["system_prompt_override"] == "Solo prompt"
    assert "rules" not in payload  # ← No debe wipear el JSONB existente


def test_build_update_payload_includes_system_prompt_when_provided():
    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import _build_update_payload

    update = TenantRulesUpdate(system_prompt_override="Hola", rules={"k": "v"})
    payload = _build_update_payload(update)

    assert payload["system_prompt_override"] == "Hola"
    assert payload["rules"] == {"k": "v"}


def test_build_update_payload_empty_when_all_none():
    """Payload vacío cuando no se provee ningún campo."""
    from app.models.tenant import TenantRulesUpdate
    from app.services.tenant_service import _build_update_payload

    update = TenantRulesUpdate()
    payload = _build_update_payload(update)

    assert payload == {}

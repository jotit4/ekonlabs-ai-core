"""Tests para get_tenant_by_phone() en app/services/tenant_service.py."""
from unittest.mock import MagicMock, patch


_VALID_TENANT_ROW = {
    "tenant_id": "12345678-1234-5678-1234-567812345678",
    "name": "Clinica Test",
    "whatsapp_number": "+15550051237",
    "timezone": "America/Buenos_Aires",
    "shadow_mode_enabled": False,
    "status": "active",
    "system_prompt_override": None,
    "rules": {},
}


def _make_mock_client(data: list | None = None):
    """Helper: crea un mock de Supabase client con la cadena de query configurada."""
    mock_result = MagicMock()
    mock_result.data = data if data is not None else []
    mock_client = MagicMock()
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .execute.return_value
    ) = mock_result
    return mock_client


def test_get_tenant_by_phone_found():
    """Número de teléfono existente en DB → retorna TenantResponse."""
    mock_client = _make_mock_client(data=[_VALID_TENANT_ROW])
    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("15550051237")
    assert result is not None
    assert str(result.tenant_id) == "12345678-1234-5678-1234-567812345678"
    assert result.name == "Clinica Test"


def test_get_tenant_by_phone_not_found():
    """Número de teléfono no existe en DB → retorna None."""
    mock_client = _make_mock_client(data=[])
    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("99999999999")
    assert result is None


def test_get_tenant_by_phone_tries_plus_format_first():
    """Número sin '+' → intenta '+{number}' primero antes que el número original."""
    eq_values_called = []

    def mock_eq(col, val):
        eq_values_called.append(val)
        mock_chain = MagicMock()
        if val == "+15550051237":
            # Primera candidato con '+' → encontrado
            mock_result = MagicMock()
            mock_result.data = [_VALID_TENANT_ROW]
            mock_chain.execute.return_value = mock_result
        else:
            mock_result = MagicMock()
            mock_result.data = []
            mock_chain.execute.return_value = mock_result
        return mock_chain

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.side_effect = mock_eq

    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("15550051237")

    assert result is not None
    assert eq_values_called[0] == "+15550051237"  # '+' format tried first
    assert len(eq_values_called) == 1  # Found on first try, no second query


def test_get_tenant_by_phone_with_plus_prefix_found():
    """Número con '+' ya incluido → lo usa directamente como primer candidato."""
    eq_values_called = []

    def mock_eq(col, val):
        eq_values_called.append(val)
        mock_chain = MagicMock()
        if val == "+15550051237":
            mock_result = MagicMock()
            mock_result.data = [_VALID_TENANT_ROW]
            mock_chain.execute.return_value = mock_result
        else:
            mock_result = MagicMock()
            mock_result.data = []
            mock_chain.execute.return_value = mock_result
        return mock_chain

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.side_effect = mock_eq

    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("+15550051237")

    assert result is not None
    assert eq_values_called[0] == "+15550051237"


def test_get_tenant_by_phone_handles_db_exception():
    """Excepción de DB → retorna None sin propagar (webhook debe responder 200)."""
    mock_client = MagicMock()
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .execute.side_effect
    ) = Exception("Supabase connection error")

    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("15550051237")

    assert result is None


def test_get_tenant_by_phone_falls_back_to_no_plus():
    """Si '+{number}' no encontrado → intenta '{number}' sin '+' como fallback."""
    eq_values_called = []

    def mock_eq(col, val):
        eq_values_called.append(val)
        mock_chain = MagicMock()
        # Solo el número sin '+' está en la DB
        if val == "15550051237":
            mock_result = MagicMock()
            mock_result.data = [_VALID_TENANT_ROW]
            mock_chain.execute.return_value = mock_result
        else:
            mock_result = MagicMock()
            mock_result.data = []
            mock_chain.execute.return_value = mock_result
        return mock_chain

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.side_effect = mock_eq

    with patch("app.services.tenant_service.get_supabase_client", return_value=mock_client):
        from app.services.tenant_service import get_tenant_by_phone
        result = get_tenant_by_phone("15550051237")

    assert result is not None
    assert len(eq_values_called) == 2  # Both formats tried
    assert "+15550051237" in eq_values_called
    assert "15550051237" in eq_values_called

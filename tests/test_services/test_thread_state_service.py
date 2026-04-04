"""Tests para app/services/thread_state_service.py — Story 3.4."""
from unittest.mock import MagicMock, patch

_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"


def _make_supabase_result(data: list) -> MagicMock:
    """Crea un mock de resultado Supabase con atributo .data."""
    mock_result = MagicMock()
    mock_result.data = data
    return mock_result


def _make_mock_client() -> MagicMock:
    """Crea un mock del cliente Supabase con cadena de métodos fluentes."""
    mock_client = MagicMock()
    # Encadenar: .table().select().eq().eq().limit().execute()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.limit.return_value = mock_table
    mock_table.upsert.return_value = mock_table
    return mock_client, mock_table


# ---------------------------------------------------------------------------
# get_thread_status
# ---------------------------------------------------------------------------


def test_get_thread_status_returns_active_when_no_record():
    """Sin registro en thread_states → retorna 'active' (estado por defecto)."""
    from app.services.thread_state_service import get_thread_status

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result([])

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        result = get_thread_status(_TENANT_ID, _PHONE)

    assert result == "active"
    mock_client.table.assert_called_once_with("thread_states")
    mock_table.select.assert_called_once_with("status")
    mock_table.eq.assert_any_call("tenant_id", _TENANT_ID)
    mock_table.eq.assert_any_call("phone_number", _PHONE)


def test_get_thread_status_returns_paused_when_record_exists():
    """Registro con status='paused' → retorna 'paused'."""
    from app.services.thread_state_service import get_thread_status

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result(
        [{"status": "paused"}]
    )

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        result = get_thread_status(_TENANT_ID, _PHONE)

    assert result == "paused"


def test_get_thread_status_returns_active_when_status_is_active():
    """Registro con status='active' → retorna 'active'."""
    from app.services.thread_state_service import get_thread_status

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result(
        [{"status": "active"}]
    )

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        result = get_thread_status(_TENANT_ID, _PHONE)

    assert result == "active"


def test_get_thread_status_returns_active_on_db_error():
    """Error de DB → retorna 'active' (fail-safe: no silenciar hilos por error de infra)."""
    from app.services.thread_state_service import get_thread_status

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.side_effect = Exception("Connection timeout")

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        result = get_thread_status(_TENANT_ID, _PHONE)

    assert result == "active"


# ---------------------------------------------------------------------------
# set_thread_paused
# ---------------------------------------------------------------------------


def test_set_thread_paused_upserts_with_correct_fields():
    """set_thread_paused hace upsert con status='paused', reason y paused_at."""
    from app.services.thread_state_service import set_thread_paused

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result([])

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        set_thread_paused(_TENANT_ID, _PHONE, reason="low_confidence")

    mock_client.table.assert_called_once_with("thread_states")
    upsert_call = mock_table.upsert.call_args
    upsert_data = upsert_call[0][0]
    assert upsert_data["tenant_id"] == _TENANT_ID
    assert upsert_data["phone_number"] == _PHONE
    assert upsert_data["status"] == "paused"
    assert upsert_data["paused_reason"] == "low_confidence"
    assert "paused_at" in upsert_data
    assert "updated_at" in upsert_data
    assert upsert_call[1]["on_conflict"] == "tenant_id,phone_number"


def test_set_thread_paused_uses_default_reason():
    """Sin reason explícita → usa 'low_confidence' como default."""
    from app.services.thread_state_service import set_thread_paused

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result([])

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        set_thread_paused(_TENANT_ID, _PHONE)

    upsert_data = mock_table.upsert.call_args[0][0]
    assert upsert_data["paused_reason"] == "low_confidence"


def test_set_thread_paused_raises_on_db_error():
    """Error de DB en upsert → re-raise (el worker loguea y continúa)."""
    import pytest
    from app.services.thread_state_service import set_thread_paused

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.side_effect = Exception("DB write error")

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        with pytest.raises(Exception, match="DB write error"):
            set_thread_paused(_TENANT_ID, _PHONE)


# ---------------------------------------------------------------------------
# set_thread_active — Story 4.2
# ---------------------------------------------------------------------------


def test_set_thread_active_upserts_with_correct_fields():
    """set_thread_active hace UPSERT con status='active', paused_reason=None, paused_at=None."""
    from app.services.thread_state_service import set_thread_active

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.return_value = _make_supabase_result([])

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        set_thread_active(_TENANT_ID, _PHONE)

    mock_client.table.assert_called_once_with("thread_states")
    upsert_call = mock_table.upsert.call_args
    upsert_data = upsert_call[0][0]
    assert upsert_data["tenant_id"] == _TENANT_ID
    assert upsert_data["phone_number"] == _PHONE
    assert upsert_data["status"] == "active"
    assert upsert_data["paused_reason"] is None
    assert upsert_data["paused_at"] is None
    assert "updated_at" in upsert_data
    assert upsert_call[1]["on_conflict"] == "tenant_id,phone_number"


def test_set_thread_active_raises_on_db_error():
    """Error de DB en upsert → re-raise (mismo contrato que set_thread_paused)."""
    import pytest
    from app.services.thread_state_service import set_thread_active

    mock_client, mock_table = _make_mock_client()
    mock_table.execute.side_effect = Exception("DB write error")

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        with pytest.raises(Exception, match="DB write error"):
            set_thread_active(_TENANT_ID, _PHONE)


def test_set_thread_active_idempotent_on_already_active_thread():
    """Llamar set_thread_active en un hilo ya activo no lanza excepción (UPSERT idempotente)."""
    from app.services.thread_state_service import set_thread_active

    mock_client, mock_table = _make_mock_client()
    # execute retorna resultado vacío — simula UPSERT sin cambio efectivo
    mock_table.execute.return_value = _make_supabase_result([])

    with patch("app.services.thread_state_service.get_supabase_client", return_value=mock_client):
        # No debe lanzar excepción
        set_thread_active(_TENANT_ID, _PHONE)

    # Verificar que se llamó de todas formas (UPSERT idempotente)
    mock_table.upsert.assert_called_once()
    upsert_data = mock_table.upsert.call_args[0][0]
    assert upsert_data["status"] == "active"

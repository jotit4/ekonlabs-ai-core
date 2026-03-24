"""Tests para app/services/conversation_service.py."""
from unittest.mock import MagicMock, patch


_TENANT_ID = "12345678-1234-5678-1234-567812345678"
_PHONE = "15551234567"

# Supabase retorna las filas más recientes primero (ORDER BY created_at DESC)
_ROWS_DESC = [
    {"id": "uuid-2", "role": "assistant", "content": "Bienvenido a la clínica", "created_at": "2026-03-24T10:01:00Z"},
    {"id": "uuid-1", "role": "user", "content": "Hola", "created_at": "2026-03-24T10:00:00Z"},
]


def _make_mock_client(data=None, raise_exc=False):
    """Helper: crea un mock de Supabase client para queries de conversations."""
    mock_result = MagicMock()
    mock_result.data = data if data is not None else []
    mock_client = MagicMock()
    chain = (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
    )
    if raise_exc:
        chain.execute.side_effect = Exception("Supabase connection error")
    else:
        chain.execute.return_value = mock_result
    return mock_client


def _make_insert_mock_client(raise_exc=False):
    """Helper: mock de Supabase client para insert en conversations."""
    mock_client = MagicMock()
    chain = mock_client.table.return_value.insert.return_value
    if raise_exc:
        chain.execute.side_effect = Exception("DB insert error")
    else:
        chain.execute.return_value = MagicMock(data=[{"id": "new-uuid"}])
    return mock_client


# ---------------------------------------------------------------------------
# get_conversation_history
# ---------------------------------------------------------------------------


def test_get_conversation_history_found():
    """Historial existente → retorna lista en orden cronológico (más antiguo primero)."""
    mock_client = _make_mock_client(data=_ROWS_DESC)
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history
        result = get_conversation_history(_PHONE, _TENANT_ID)
    assert len(result) == 2
    # Verificar orden cronológico asc (reversed del resultado DESC de Supabase)
    assert result[0]["content"] == "Hola"          # más antiguo primero
    assert result[0]["role"] == "user"
    assert result[1]["content"] == "Bienvenido a la clínica"
    assert result[1]["role"] == "assistant"


def test_get_conversation_history_empty():
    """Sin historial → retorna lista vacía."""
    mock_client = _make_mock_client(data=[])
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history
        result = get_conversation_history(_PHONE, _TENANT_ID)
    assert result == []


def test_get_conversation_history_handles_exception():
    """Excepción de Supabase → retorna [] sin propagar (worker no debe crashear)."""
    mock_client = _make_mock_client(raise_exc=True)
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history
        result = get_conversation_history(_PHONE, _TENANT_ID)
    assert result == []


def test_get_conversation_history_reverses_supabase_order():
    """Supabase retorna DESC → el resultado final está en orden ASC (cronológico)."""
    rows_out_of_order = [
        {"id": "c", "role": "assistant", "content": "msg3", "created_at": "2026-03-24T12:00:00Z"},
        {"id": "b", "role": "user", "content": "msg2", "created_at": "2026-03-24T11:00:00Z"},
        {"id": "a", "role": "user", "content": "msg1", "created_at": "2026-03-24T10:00:00Z"},
    ]
    mock_client = _make_mock_client(data=rows_out_of_order)
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history
        result = get_conversation_history(_PHONE, _TENANT_ID)
    assert result[0]["content"] == "msg1"
    assert result[1]["content"] == "msg2"
    assert result[2]["content"] == "msg3"


def test_get_conversation_history_applies_limit():
    """El query incluye .limit(MAX_HISTORY_MESSAGES) para no cargar historial infinito."""
    mock_client = _make_mock_client(data=[])
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history, MAX_HISTORY_MESSAGES
        get_conversation_history(_PHONE, _TENANT_ID)
    # Verificar que .limit() fue llamado con MAX_HISTORY_MESSAGES
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.assert_called_once_with(MAX_HISTORY_MESSAGES)


def test_get_conversation_history_filters_by_tenant_and_phone():
    """El query filtra por tenant_id Y phone_number para aislamiento multi-tenant."""
    mock_client = _make_mock_client(data=[])
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import get_conversation_history
        get_conversation_history(_PHONE, _TENANT_ID)
    # Verificar que el primer filtro usa tenant_id con el valor correcto
    first_eq = mock_client.table.return_value.select.return_value.eq
    first_eq.assert_called_once_with("tenant_id", _TENANT_ID)
    # Verificar que el segundo filtro usa phone_number con el valor correcto
    second_eq = mock_client.table.return_value.select.return_value.eq.return_value.eq
    second_eq.assert_called_once_with("phone_number", _PHONE)


# ---------------------------------------------------------------------------
# save_message
# ---------------------------------------------------------------------------


def test_save_message_inserts_correctly():
    """save_message llama a .insert() con el payload correcto."""
    mock_client = _make_insert_mock_client()
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import save_message
        save_message(_PHONE, _TENANT_ID, "user", "Hola quiero una cita")

    expected_payload = {
        "tenant_id": _TENANT_ID,
        "phone_number": _PHONE,
        "role": "user",
        "content": "Hola quiero una cita",
    }
    mock_client.table.return_value.insert.assert_called_once_with(expected_payload)
    mock_client.table.return_value.insert.return_value.execute.assert_called_once()


def test_save_message_handles_exception():
    """Excepción en insert → no propaga (error silenciado con warning log)."""
    mock_client = _make_insert_mock_client(raise_exc=True)
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import save_message
        # No debe lanzar excepción
        save_message(_PHONE, _TENANT_ID, "assistant", "Respuesta del agente")


def test_save_message_saves_assistant_role():
    """save_message acepta role='assistant' correctamente."""
    mock_client = _make_insert_mock_client()
    with patch("app.services.conversation_service.get_supabase_client", return_value=mock_client):
        from app.services.conversation_service import save_message
        save_message(_PHONE, _TENANT_ID, "assistant", "Te puedo ayudar")

    call_arg = mock_client.table.return_value.insert.call_args[0][0]
    assert call_arg["role"] == "assistant"
    assert call_arg["content"] == "Te puedo ayudar"

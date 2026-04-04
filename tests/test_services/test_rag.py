"""Tests for RAG service — mocks OpenAI embeddings and psycopg2 pool."""
import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJyb2xlIjoic2VydmljZV9yb2xlIn0"
    ".fake_sig_for_tests_only",
)
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fakedb")
os.environ.setdefault("OPENAI_API_KEY", "sk-fake-key-for-tests")

# Import the module so patch() can resolve "app.services.rag_service.*"
import app.services.rag_service  # noqa: E402
from app.services.rag_service import ingest_document, search_knowledge  # noqa: E402

from unittest.mock import MagicMock, patch
import pytest


TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
FAKE_VECTOR = [0.1] * 1536


def _make_mock_conn():
    """Return a mock psycopg2 connection with a usable cursor."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


def _mock_pool(mock_conn):
    """Return a mock ThreadedConnectionPool that yields mock_conn."""
    pool = MagicMock()
    pool.getconn.return_value = mock_conn
    pool.putconn = MagicMock()
    return pool


def test_ingest_document_stores_chunks_with_tenant_id(tmp_path):
    """ingest_document must INSERT every chunk with the correct tenant_id."""
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"")

    fake_docs = [MagicMock(page_content="Precio implante oseointegrado: $800") for _ in range(2)]
    fake_chunks = [MagicMock(page_content=f"chunk {i}") for i in range(3)]
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)

    with (
        patch("app.services.rag_service.PyPDFLoader") as MockLoader,
        patch("app.services.rag_service.RecursiveCharacterTextSplitter") as MockSplitter,
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockLoader.return_value.load.return_value = fake_docs
        MockSplitter.return_value.split_documents.return_value = fake_chunks
        MockEmbed.return_value.embed_documents.return_value = [FAKE_VECTOR] * 3

        count = ingest_document(TENANT_ID, str(pdf_path), "test.pdf")

    assert count == 3
    # Every INSERT must include tenant_id in its params
    for insert_call in mock_cursor.execute.call_args_list:
        args = insert_call[0]
        sql, params = args[0], args[1]
        if "INSERT" in sql.upper():
            assert TENANT_ID in params, "tenant_id missing from INSERT params"

    # Connection must always be returned to the pool (no leak)
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_ingest_document_returns_chunk_count(tmp_path):
    """ingest_document return value must equal number of chunks stored."""
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"")

    fake_docs = [MagicMock(page_content="contenido")]
    fake_chunks = [MagicMock(page_content=f"c{i}") for i in range(5)]
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)

    with (
        patch("app.services.rag_service.PyPDFLoader") as MockLoader,
        patch("app.services.rag_service.RecursiveCharacterTextSplitter") as MockSplitter,
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockLoader.return_value.load.return_value = fake_docs
        MockSplitter.return_value.split_documents.return_value = fake_chunks
        MockEmbed.return_value.embed_documents.return_value = [FAKE_VECTOR] * 5

        count = ingest_document(TENANT_ID, str(pdf_path), "tarifario.pdf")

    assert count == 5
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_search_knowledge_filters_by_tenant_id():
    """search_knowledge SQL must always include tenant_id in WHERE clause."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.fetchall.return_value = [
        ("Consulta inicial $50", "tarifario.pdf", 0.92)
    ]

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR

        results = search_knowledge(TENANT_ID, "precio consulta", k=3)

    # The SELECT must pass tenant_id as a parameter (never interpolated)
    found_tenant_in_params = any(
        TENANT_ID in c[0][1]
        for c in mock_cursor.execute.call_args_list
        if len(c[0]) > 1
    )
    assert found_tenant_in_params, "tenant_id must appear in SELECT params"

    assert len(results) == 1
    assert results[0]["content"] == "Consulta inicial $50"
    assert results[0]["source_filename"] == "tarifario.pdf"
    assert "similarity" in results[0]

    # Connection must be returned to pool even on success
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_search_knowledge_never_returns_other_tenant_chunks():
    """search_knowledge returns empty list when DB has no results for this tenant."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.fetchall.return_value = []

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR

        results = search_knowledge(TENANT_ID, "precio implante", k=3)

    assert results == []


def test_search_knowledge_filters_below_threshold():
    """search_knowledge must exclude results with similarity < 0.60."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.fetchall.return_value = [
        ("content A", "a.pdf", 0.45),
        ("content B", "b.pdf", 0.72),
    ]

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR
        results = search_knowledge(TENANT_ID, "precio consulta", k=3)

    assert len(results) == 1
    assert results[0]["similarity"] == 0.72


def test_search_knowledge_returns_empty_list_when_all_below_threshold():
    """search_knowledge must return [] when all rows are below 0.60 threshold."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.fetchall.return_value = [
        ("content X", "x.pdf", 0.30),
        ("content Y", "y.pdf", 0.55),
    ]

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR
        results = search_knowledge(TENANT_ID, "precio consulta", k=3)

    assert results == []


def test_search_knowledge_includes_chunk_at_exactly_threshold():
    """search_knowledge must include results with similarity == 0.60 (inclusive)."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.fetchall.return_value = [
        ("content Z", "z.pdf", 0.60),
    ]

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR
        results = search_knowledge(TENANT_ID, "precio consulta", k=3)

    assert len(results) == 1
    assert results[0]["similarity"] == 0.60


def test_ingest_deletes_existing_chunks_before_insert(tmp_path):
    """ingest_document must DELETE existing chunks before INSERTing new ones."""
    pdf_path = tmp_path / "clinic.pdf"
    pdf_path.write_bytes(b"")
    fake_chunks = [MagicMock(page_content="chunk 0")]
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)

    with (
        patch("app.services.rag_service.PyPDFLoader") as MockLoader,
        patch("app.services.rag_service.RecursiveCharacterTextSplitter") as MockSplitter,
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockLoader.return_value.load.return_value = [MagicMock(page_content="p")]
        MockSplitter.return_value.split_documents.return_value = fake_chunks
        MockEmbed.return_value.embed_documents.return_value = [FAKE_VECTOR]
        ingest_document(TENANT_ID, str(pdf_path), "clinic.pdf")

    calls = mock_cursor.execute.call_args_list
    delete_calls = [c for c in calls if "DELETE" in str(c[0][0]).upper()]
    assert len(delete_calls) >= 1
    delete_idx = next(i for i, c in enumerate(calls) if "DELETE" in str(c[0][0]).upper())
    insert_idx = next(i for i, c in enumerate(calls) if "INSERT" in str(c[0][0]).upper())
    assert delete_idx < insert_idx


def test_ingest_delete_uses_correct_params(tmp_path):
    """DELETE must use the correct tenant_id and source_filename params."""
    pdf_path = tmp_path / "tarifario.pdf"
    pdf_path.write_bytes(b"")
    fake_chunks = [MagicMock(page_content="chunk 0")]
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)

    with (
        patch("app.services.rag_service.PyPDFLoader") as MockLoader,
        patch("app.services.rag_service.RecursiveCharacterTextSplitter") as MockSplitter,
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockLoader.return_value.load.return_value = [MagicMock(page_content="p")]
        MockSplitter.return_value.split_documents.return_value = fake_chunks
        MockEmbed.return_value.embed_documents.return_value = [FAKE_VECTOR]
        ingest_document(TENANT_ID, str(pdf_path), "tarifario.pdf")

    calls = mock_cursor.execute.call_args_list
    delete_call = next(c for c in calls if "DELETE" in str(c[0][0]).upper())
    delete_params = delete_call[0][1]
    assert TENANT_ID in delete_params
    assert "tarifario.pdf" in delete_params


def test_chunk_size_constant_is_400():
    """_CHUNK_SIZE must equal 400."""
    import app.services.rag_service as m
    assert m._CHUNK_SIZE == 400


def test_chunk_overlap_constant_is_60():
    """_CHUNK_OVERLAP must equal 60."""
    import app.services.rag_service as m
    assert m._CHUNK_OVERLAP == 60


def test_connection_returned_to_pool_on_db_error():
    """Pool connection must be returned even when a DB operation raises an exception."""
    mock_conn, mock_cursor = _make_mock_conn()
    mock_pool = _mock_pool(mock_conn)
    mock_cursor.execute.side_effect = Exception("DB connection lost")

    with (
        patch("app.services.rag_service._get_embedder") as MockEmbed,
        patch("app.services.rag_service._get_pool", return_value=mock_pool),
        patch("app.services.rag_service.register_vector"),
    ):
        MockEmbed.return_value.embed_query.return_value = FAKE_VECTOR

        from app.core.exceptions import AppException

        with pytest.raises(AppException) as exc_info:
            search_knowledge(TENANT_ID, "precio consulta", k=3)

    assert exc_info.value.code == "RAG_SEARCH_FAILED"
    # CRITICAL: connection must be returned to pool even after exception
    mock_pool.putconn.assert_called_once_with(mock_conn)

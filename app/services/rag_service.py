"""pgvector search + embedding — servicio RAG multi-tenant."""
from __future__ import annotations

import psycopg2
import psycopg2.pool
from pgvector.psycopg2 import register_vector

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings

import structlog

from app.core.config import settings
from app.core.exceptions import AppException

logger = structlog.get_logger(__name__)

_CHUNK_SIZE = 400
_CHUNK_OVERLAP = 60
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIMS = 1536
_SIMILARITY_THRESHOLD: float = 0.60

# Module-level singletons — created once, reused across calls
_embedder: OpenAIEmbeddings | None = None
_db_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_embedder() -> OpenAIEmbeddings:
    """Return the module-level OpenAIEmbeddings singleton."""
    global _embedder
    if _embedder is None:
        _embedder = OpenAIEmbeddings(model=_EMBED_MODEL)
    return _embedder


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Return (or create) the module-level psycopg2 connection pool."""
    global _db_pool
    if _db_pool is None:
        if not settings.DATABASE_URL:
            raise AppException(
                "RAG_CONFIG_MISSING",
                "DATABASE_URL no está configurado. Es obligatorio para operaciones RAG.",
                500,
            )
        _db_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=settings.DATABASE_URL,
        )
    return _db_pool


def _get_db_connection():
    """Borrow a connection from the pool and register the pgvector adapter."""
    conn = _get_pool().getconn()
    register_vector(conn)
    return conn


def _release_db_connection(conn) -> None:
    """Return a connection to the pool."""
    try:
        _get_pool().putconn(conn)
    except Exception:
        pass  # pool already closed or conn already returned


def ingest_text(tenant_id: str, text: str, source_filename: str) -> int:
    """Chunk plain text, embed it, and store all chunks in knowledge_chunks.

    Args:
        tenant_id: UUID of the tenant that owns this content.
        text: Raw text content to ingest.
        source_filename: Logical name stored in the DB (e.g. "isadi-info.txt").

    Returns:
        Number of chunks inserted.

    Raises:
        AppException: RAG_INGEST_FAILED on any error.
    """
    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
        )
        chunks = splitter.split_text(text)

        if not chunks:
            logger.warning("rag.ingest.no_chunks", tenant_id=tenant_id, file=source_filename)
            return 0

        embedder = _get_embedder()
        vectors = embedder.embed_documents(chunks)

        conn = _get_db_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM public.knowledge_chunks WHERE tenant_id = %s AND source_filename = %s",
                        (tenant_id, source_filename),
                    )
                    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
                        cur.execute(
                            """
                            INSERT INTO public.knowledge_chunks
                                (tenant_id, content, embedding, source_filename, chunk_index)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (tenant_id, chunk, vector, source_filename, idx),
                        )
        finally:
            _release_db_connection(conn)

        logger.info("rag.ingest.done", tenant_id=tenant_id, file=source_filename, chunks=len(chunks))
        return len(chunks)

    except AppException:
        raise
    except Exception as exc:
        logger.error("rag.ingest.error", tenant_id=tenant_id, error=str(exc))
        raise AppException("RAG_INGEST_FAILED", f"Error al ingestar texto: {exc}", 500) from exc


def ingest_document(tenant_id: str, file_path: str, source_filename: str) -> int:
    """Load a PDF, chunk it, embed it, and store all chunks in knowledge_chunks.

    Args:
        tenant_id: UUID of the tenant that owns this document.
        file_path: Absolute path to the PDF file on disk.
        source_filename: Human-readable filename stored in the DB (e.g. "tarifario.pdf").

    Returns:
        Number of chunks inserted.

    Raises:
        AppException: RAG_INGEST_FAILED on any error.
    """
    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
        )
        chunks = splitter.split_documents(docs)

        if not chunks:
            logger.warning("rag.ingest.no_chunks", tenant_id=tenant_id, file=source_filename)
            return 0

        embedder = _get_embedder()
        texts = [c.page_content for c in chunks]
        vectors = embedder.embed_documents(texts)

        conn = _get_db_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        DELETE FROM public.knowledge_chunks
                        WHERE tenant_id = %s AND source_filename = %s
                        """,
                        (tenant_id, source_filename),
                    )
                    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
                        cur.execute(
                            """
                            INSERT INTO public.knowledge_chunks
                                (tenant_id, content, embedding, source_filename, chunk_index)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (tenant_id, chunk.page_content, vector, source_filename, idx),
                        )
        finally:
            _release_db_connection(conn)

        logger.info(
            "rag.ingest.done",
            tenant_id=tenant_id,
            file=source_filename,
            chunks=len(chunks),
        )
        return len(chunks)

    except AppException:
        raise
    except Exception as exc:
        logger.error("rag.ingest.error", tenant_id=tenant_id, error=str(exc))
        raise AppException("RAG_INGEST_FAILED", f"Error al ingestar documento: {exc}", 500) from exc


def search_knowledge(tenant_id: str, query: str, k: int = 3) -> list[dict]:
    """Vector similarity search filtered strictly by tenant_id.

    Args:
        tenant_id: UUID of the tenant — ALWAYS applied as WHERE filter.
        query: Natural language query to embed and search.
        k: Maximum number of results to return.

    Returns:
        List of dicts: [{"content": str, "source_filename": str, "similarity": float}]

    Raises:
        AppException: RAG_SEARCH_FAILED on any error.
    """
    try:
        embedder = _get_embedder()
        query_vector = embedder.embed_query(query)

        conn = _get_db_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    # Explicit ::vector cast required when using Supabase connection pooler
                    # (transaction mode) — register_vector() adapter doesn't persist across pool connections.
                    cur.execute(
                        """
                        SELECT content, source_filename, 1 - (embedding <=> %s::vector) AS similarity
                        FROM public.knowledge_chunks
                        WHERE tenant_id = %s
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (query_vector, tenant_id, query_vector, k),
                    )
                    rows = cur.fetchall()
        finally:
            _release_db_connection(conn)

        return [
            {"content": row[0], "source_filename": row[1], "similarity": float(row[2])}
            for row in rows
            if float(row[2]) >= _SIMILARITY_THRESHOLD
        ]

    except AppException:
        raise
    except Exception as exc:
        logger.error("rag.search.error", tenant_id=tenant_id, error=str(exc))
        raise AppException("RAG_SEARCH_FAILED", f"Error en búsqueda vectorial: {exc}", 500) from exc

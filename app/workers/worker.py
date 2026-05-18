"""RQ Worker entrypoint — consume tareas de la cola Redis."""
import os

# Propagar LangSmith a os.environ ANTES de cualquier import de langchain/langsmith.
# main.py hace lo mismo para el proceso FastAPI, pero el worker es un proceso separado
# y start.sh lo inicia directamente, sin pasar por el lifespan de FastAPI.
# Al hacerlo aquí a nivel de módulo garantizamos que los env vars están listos
# cuando rq importa tasks.py (que importa langchain_openai).
from app.core.config import settings  # pydantic-settings: lee os.environ al instanciar

_tracing_raw = settings.LANGCHAIN_TRACING_V2
_api_key = settings.LANGCHAIN_API_KEY
_project = settings.LANGCHAIN_PROJECT

if _tracing_raw.lower() == "true":
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = _api_key
    os.environ["LANGCHAIN_PROJECT"] = _project
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = _api_key
    os.environ["LANGSMITH_PROJECT"] = _project

from redis import Redis  # noqa: E402
from rq import Worker, Queue  # noqa: E402

from app.core.logging import configure_logging, get_logger  # noqa: E402


def main():
    configure_logging()
    logger = get_logger(__name__)
    logger.info(
        "worker.langsmith_init",
        tracing_enabled=(_tracing_raw.lower() == "true"),
        api_key_set=bool(_api_key),
        api_key_prefix=_api_key[:12] if _api_key else "EMPTY",
        project=_project,
        langsmith_tracing_env=os.environ.get("LANGSMITH_TRACING", "NOT_SET"),
        langchain_tracing_env=os.environ.get("LANGCHAIN_TRACING_V2", "NOT_SET"),
    )
    if _tracing_raw.lower() == "true":
        try:
            import langsmith
            client = langsmith.Client(api_key=_api_key)
            projects = list(client.list_projects())
            logger.info("worker.langsmith_connection_ok", projects=[p.name for p in projects[:5]])
        except Exception as ls_exc:
            logger.error("worker.langsmith_connection_failed", error=str(ls_exc))

    connection = Redis.from_url(settings.REDIS_URL)

    # Al iniciar, eliminar todos los jobs en rq:scheduled:default que sean anteriores
    # a hace 30 minutos. Esto evita que jobs viejos de sesiones previas se reencolen
    # y envíen respuestas stale a pacientes en futuros reinicios del contenedor.
    _purge_stale_scheduled_jobs(connection, logger)

    queues = [Queue("default", connection=connection)]
    worker = Worker(queues, connection=connection)
    worker.work()


def _purge_stale_scheduled_jobs(connection: Redis, logger) -> None:
    """Elimina jobs scheduled con timestamp de creación anterior a 30 minutos."""
    import time
    cutoff = time.time() - 1800  # 30 minutos atrás
    try:
        scheduled = connection.zrangebyscore("rq:scheduled:default", "-inf", cutoff)
        if not scheduled:
            return
        for jid in scheduled:
            connection.zrem("rq:scheduled:default", jid)
            connection.delete(f"rq:job:{jid.decode()}")
        logger.info("worker.purge_stale_scheduled_jobs", purged=len(scheduled))
    except Exception as exc:
        logger.warning("worker.purge_stale_scheduled_jobs.error", error=str(exc))


if __name__ == "__main__":
    main()

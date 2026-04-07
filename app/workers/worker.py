"""RQ Worker entrypoint — consume tareas de la cola Redis."""
import os

# Propagar LangSmith a os.environ ANTES de cualquier import de langchain/langsmith.
# main.py hace lo mismo para el proceso FastAPI, pero el worker es un proceso separado
# y start.sh lo inicia directamente, sin pasar por el lifespan de FastAPI.
# Al hacerlo aquí a nivel de módulo garantizamos que los env vars están listos
# cuando rq importa tasks.py (que importa langchain_openai).
from app.core.config import settings  # pydantic-settings: lee os.environ al instanciar

if settings.LANGCHAIN_TRACING_V2.lower() == "true":
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT

from redis import Redis  # noqa: E402
from rq import Worker, Queue  # noqa: E402

from app.core.logging import configure_logging  # noqa: E402


def main():
    configure_logging()
    connection = Redis.from_url(settings.REDIS_URL)
    queues = [Queue("default", connection=connection)]
    worker = Worker(queues, connection=connection)
    worker.work()


if __name__ == "__main__":
    main()

"""RQ Worker entrypoint — consume tareas de la cola Redis."""
import os

from redis import Redis
from rq import Worker, Queue

from app.core.config import settings
from app.core.logging import configure_logging


def main():
    # Propagar LangSmith al os.environ del proceso worker ANTES de que rq importe tasks.
    # main.py hace lo mismo para el proceso FastAPI — el worker es un proceso separado
    # y nunca pasa por el lifespan de FastAPI, así que necesita su propia propagación.
    configure_logging()
    if settings.LANGCHAIN_TRACING_V2.lower() == "true":
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT

    connection = Redis.from_url(settings.REDIS_URL)
    queues = [Queue("default", connection=connection)]
    worker = Worker(queues, connection=connection)
    worker.work()


if __name__ == "__main__":
    main()

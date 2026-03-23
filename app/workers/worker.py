"""RQ Worker entrypoint — consume tareas de la cola Redis."""
# TODO: Registrar tareas reales (Story 2.x+)

from redis import Redis
from rq import Worker, Queue

from app.core.config import settings


def main():
    connection = Redis.from_url(settings.REDIS_URL)
    queues = [Queue("default", connection=connection)]
    worker = Worker(queues, connection=connection)
    worker.work()


if __name__ == "__main__":
    main()

#!/bin/bash
set -e

# Start RQ worker in background
rq worker --url "$REDIS_URL" --with-scheduler default &
WORKER_PID=$!

# Start FastAPI (foreground — si muere, muere el contenedor)
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Si uvicorn muere, matamos el worker también
kill $WORKER_PID 2>/dev/null || true

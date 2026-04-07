#!/bin/bash
set -e

# Start RQ worker via our Python module (ensures LangSmith env vars are propagated)
python -m app.workers.worker &
WORKER_PID=$!

# Start FastAPI (foreground — si muere, muere el contenedor)
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Si uvicorn muere, matamos el worker también
kill $WORKER_PID 2>/dev/null || true

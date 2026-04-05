# =============================================================================
# Stage 1: Builder — instala dependencias en virtualenv aislado
# =============================================================================
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml .
COPY app/ ./app/

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# =============================================================================
# Stage 2: Runtime — imagen mínima sin build tools ni gcc
# =============================================================================
FROM python:3.11-slim AS runtime

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN useradd --create-home --shell /bin/bash appuser
WORKDIR /app

COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser start.sh ./start.sh
RUN chmod +x ./start.sh

USER appuser

EXPOSE 8000

CMD ["./start.sh"]

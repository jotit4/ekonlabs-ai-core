# ekonlabs-ai-core

Open-source backend foundation for multi-tenant clinical AI assistants.

`ekonlabs-ai-core` is a Python/FastAPI service focused on infrastructure concerns that healthcare-facing AI products usually need early: tenant isolation, configurable tenant rules, RAG primitives, and operational boundaries (rate limiting, async workers, migrations).

## Why this project exists

Most AI assistant demos are single-tenant and hard to operationalize. This project focuses on the reusable backend layer that teams can adapt for real deployments in clinics and regulated contexts.

## Current status

This repository is **active work in progress**. Core backend foundations are implemented and tested; some agent orchestration endpoints are intentionally scaffolded for upcoming milestones.

Implemented today:
- FastAPI API base with standardized response envelopes and error handling.
- Tenant management endpoints (`POST /api/v1/tenants`, `PATCH /api/v1/tenants/{tenant_id}/rules`).
- Multi-tenant configuration models and tenant rules merge behavior.
- RAG service primitives:
  - PDF ingestion to `knowledge_chunks` with OpenAI embeddings.
  - pgvector similarity search with strict `tenant_id` filtering.
- SlowAPI limiter integration (global burst limit + tenant key strategy helper).
- Dockerized local stack (`api`, `worker`, `redis`) and SQL migrations.

Planned next milestones:
- Meta/WhatsApp webhook signature validation and ingestion pipeline.
- Full LangGraph orchestration flow (intent -> retrieval -> generation -> scheduling/handoff).
- Calendar and notification workflow completion.

## Architecture

- **API**: FastAPI
- **Data**: Supabase/PostgreSQL + pgvector
- **Async Jobs**: Redis + RQ worker
- **Agent Layer**: LangGraph nodes/tools (incremental implementation)
- **Containerization**: Docker / Docker Compose

## Repository layout

- `app/api/` - HTTP endpoints
- `app/services/` - business logic and external integrations
- `app/agent/` - agent state, nodes, tools, graph scaffolding
- `app/core/` - config, logging, security, database, rate limiting
- `app/models/` - Pydantic API/domain contracts
- `app/workers/` - async task queue execution
- `migrations/` - SQL schema and feature migrations
- `scripts/` - operational scripts (for example knowledge ingestion)
- `tests/` - API, service, core, and worker tests
- `docs/` - project docs and OSS application playbooks

## Quick start

### 1) Clone and configure

```bash
git clone <your-fork-or-repo-url>
cd ekonlabs-ai-core
cp .env.example .env
# Fill required values in .env
```

### 2) Run with Docker Compose

```bash
docker-compose up --build
```

API will be available at `http://localhost:8000`.

### 3) Health check

```bash
curl http://localhost:8000/api/v1/health
```

## Local development (without Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## Knowledge ingestion script

Ingest a PDF into one tenant knowledge base:

```bash
python scripts/ingest.py --tenant-id <tenant-uuid> --file path/to/document.pdf
```

Dry-run mode:

```bash
python scripts/ingest.py --tenant-id <tenant-uuid> --file path/to/document.pdf --dry-run
```

## Testing

```bash
pip install -e ".[dev]"
pytest
```

Recommended Python version for development and CI is **3.11**.

## Security and community

- Security policy: see [SECURITY.md](SECURITY.md)
- Contribution guide: see [CONTRIBUTING.md](CONTRIBUTING.md)
- Support channels: see [SUPPORT.md](SUPPORT.md)
- Code of Conduct: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Claude for OSS application notes

If you are preparing this project for Anthropic's program, see:
- [docs/claude-for-oss-application-playbook.md](docs/claude-for-oss-application-playbook.md)

## License

MIT - see [LICENSE](LICENSE).

# Contributing

Thanks for your interest in contributing to `ekonlabs-ai-core`.

## Before opening a PR

1. Open or reference an issue describing the problem.
2. Keep changes focused and small.
3. Add or update tests when behavior changes.
4. Update docs when public behavior changes.

## Development setup

```bash
git clone <repo-url>
cd ekonlabs-ai-core
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

For local infrastructure:

```bash
docker-compose up --build
```

## Branch and commit style

- Branch naming: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`
- Commit style: short imperative message, for example:
  - `feat(api): add tenant rules merge behavior`
  - `fix(rag): always return pooled connection`

## Pull request checklist

- [ ] Code builds and runs locally.
- [ ] Tests pass locally for changed areas.
- [ ] No secrets or credentials are committed.
- [ ] Public API changes are documented.
- [ ] Migration scripts are included for schema changes.

## Security-sensitive contributions

If your change touches authentication, tenant isolation, data access, or external webhooks:

- Explain the threat model in the PR description.
- Include negative tests (forbidden/invalid paths).
- Prefer explicit failure over silent fallback.

## AI-assisted contributions

AI-assisted code is welcome, but maintainers require:

- Human review of every changed line.
- Tests for relevant behavior.
- Clear rationale in PR description.


# GitHub Publication Checklist

Use this checklist before making `ekonlabs-ai-core` public.

## Repository hygiene

- [ ] Ensure `.env` is ignored and not tracked.
- [ ] Run a secret scan (manual grep + GitHub secret scanning once public).
- [ ] Confirm no local-only files are committed.
- [ ] Confirm license choice (`MIT`) is acceptable.

## GitHub settings

- [ ] Set repository description.
- [ ] Add project website URL (if available).
- [ ] Add topics (suggestion): `fastapi`, `langgraph`, `rag`, `pgvector`, `multi-tenant`, `healthcare-ai`, `open-source`.
- [ ] Upload social preview image.

## Security settings

- [ ] Enable Dependabot alerts.
- [ ] Enable secret scanning.
- [ ] Enable push protection.
- [ ] Enable private vulnerability reporting.

## Community profile

- [ ] README
- [ ] LICENSE
- [ ] CONTRIBUTING
- [ ] CODE_OF_CONDUCT
- [ ] SECURITY
- [ ] SUPPORT

## Optional polish

- [ ] Add issue templates.
- [ ] Add PR template.
- [ ] Add CI workflow once Python/runtime matrix is validated.


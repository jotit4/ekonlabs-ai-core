# Security Policy

## Supported versions

This project is under active development. Security fixes are applied on the default branch.

## Reporting a vulnerability

Please do **not** open a public issue for security vulnerabilities.

Instead:

1. Use GitHub private vulnerability reporting (Security tab) when available.
2. If private reporting is not enabled, contact maintainers through a confidential channel on GitHub.

When reporting, include:

- Clear description of the issue.
- Steps to reproduce.
- Impact assessment (what data or boundary is affected).
- Suggested remediation, if known.

## Response targets

- Initial triage acknowledgement: within 7 days.
- Status update after triage: as soon as reproducibility is confirmed.
- Fix timeline: depends on severity and exploitability.

## Scope highlights

Security-critical areas in this repository include:

- Tenant isolation (`tenant_id` scoping in data access).
- Webhook signature validation.
- Authentication and secret handling.
- External provider integrations (Supabase, OpenAI, Meta APIs).


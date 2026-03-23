# Claude for OSS Application Playbook

This document is for maintainers of `ekonlabs-ai-core` who want to apply to Anthropic's Claude for Open Source program.

## Program facts to keep in mind

- Benefit: 6 months of Claude Max 20x.
- Rolling review; capped recipients.
- Current terms mention an application period ending June 30, 2026 (unless extended).
- You can apply under:
  - Maintainer track (stars/download thresholds), or
  - Ecosystem impact track (discretionary).

Official pages:
- https://claude.com/contact-sales/claude-for-oss
- https://www.anthropic.com/claude-for-oss-terms

## Minimum repo readiness checklist

Before submitting the form:

- [ ] Repository is public.
- [ ] README clearly explains problem, architecture, and current status.
- [ ] `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md` are present.
- [ ] `.env` and credentials are not committed.
- [ ] At least one clear setup path works (Docker or local Python).
- [ ] Recent commits in the last 3 months are visible.

## Positioning strategy for this project

Use the ecosystem-impact framing:

- This is not "just another chatbot".
- It is reusable backend infrastructure for multi-tenant clinical AI systems.
- It focuses on hard operational boundaries: tenant isolation, data partitioning, rate limiting, and RAG boundaries.
- It is built to be adapted by other OSS teams working in healthcare-adjacent domains.

## Form field guidance

Prepare these values before opening the form:

1. GitHub profile URL.
2. Primary repository URL (`ekonlabs-ai-core`).
3. Email tied to your Claude account.
4. Ecosystem impact explanation (concise, measurable, credible).

## Suggested ecosystem impact answer (short version)

I maintain ekonlabs-ai-core, an open-source backend for multi-tenant clinical AI assistants. The project addresses infrastructure problems many teams face but rarely solve in public: strict tenant isolation, tenant-specific rule control, rate limiting boundaries, and retrieval pipelines for domain knowledge. It is designed as reusable backend infrastructure, not a one-off demo. I have been actively maintaining it with ongoing commits and tests in the last three months. I am applying through the ecosystem impact path because this project can serve as a shared foundation for healthcare-adjacent OSS teams that need safer multi-tenant AI backends.

## Suggested ecosystem impact answer (long version)

I maintain ekonlabs-ai-core, an open-source backend foundation for multi-tenant clinical AI assistants. The project focuses on infrastructure-level challenges that many teams face but often rebuild privately: tenant isolation, tenant-level rules, controlled retrieval pipelines, and operational boundaries for AI-driven workflows.

From a technical perspective, the repository provides a practical base for teams who need to separate tenant data correctly, enforce API traffic controls, and build RAG workflows scoped by tenant. This is especially relevant in healthcare-adjacent environments where data separation and predictable behavior matter more than demo velocity.

I have been actively maintaining the project with recent development and tests over the last three months, and the roadmap includes webhook hardening and full agent orchestration.

I am applying via the ecosystem impact track because the project's value is as a reusable public foundation that other developers can adapt, audit, and improve, rather than a closed internal implementation. If approved, I will use Claude Max to accelerate issue triage, test coverage growth, and security-oriented review cycles while keeping human review mandatory for all merges.

## After submitting

- Save a copy of the exact submitted text.
- Track response date.
- If approved, publish a short changelog note about how the benefit will be used (testing, security review, docs quality).


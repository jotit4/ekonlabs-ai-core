# Milestones

## v1.0 — Core Agent (BMAD) ✓ Completed March 2026

**Shipped:**
- Multi-tenant architecture (Supabase, tenant resolution by WhatsApp number)
- LangGraph agent: triage, anti_diagnostic, booking, scheduling, rag_retrieval, generation
- WhatsApp via Meta Cloud API (HMAC signature verification)
- Google Calendar integration (availability, create, cancel events)
- RAG knowledge base per tenant (pgvector embeddings)
- Kill switch / shadow mode per tenant
- Human handoff (silence mode + resume)
- Rate limiting
- Docker + nginx deployment config
- 30+ tests

**Last phase:** 4 (Epic 4 — Human handoff)
**Ended:** 2026-03-30

---

## v1.1 — Production Hardening ✓ Completed April 2026

**Shipped:**
- Intent detection robustness (Argentine Spanish, slot selection, booking confirm keywords, anti-diagnostic routing)
- RAG quality (similarity threshold 0.60, dedup on re-ingest, chunk size reduction, multi-turn query, XML injection hardening)
- Infrastructure reliability (Redis pool, 503 on Redis failure, RQ retry policy, webhook dedup via SET NX, booking race window fix)
- Security hardening (fail-fast secrets, admin API key auth, Redis PING at startup)
- Copy improvements (hardcoded responses, Argentine Spanish voseo, temperature 0.3 + timeout 20s)
- Evolution API integration (webhook endpoint, payload normalizer, provider dispatch, send layer, config fields)

**Last phase:** 10 (Phase 10 — Evolution API Integration)
**Ended:** 2026-04-05

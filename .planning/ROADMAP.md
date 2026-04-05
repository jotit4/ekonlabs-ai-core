# Roadmap — v1.1 Production Hardening

**Milestone:** v1.1 Production Hardening
**Goal:** Fix audit findings so ekonlabs-ai-core deploys for first paying client (ISADI) with confidence
**Timeline:** 1 week (5 working days, ~1 day per phase)
**Phases:** 5 (numbered 5–9, continuing from v1.0 which ended at Phase 4)
**Coverage:** 25/25 requirements mapped

---

## Phases

- [x] **Phase 5: Intent Detection Fixes** — Fix slot selection, keyword coverage, routing edge cases, and state flag for slot ambiguity
- [x] **Phase 6: RAG Quality** — Similarity threshold, confidence scoring, dedup on re-ingest, chunk size, multi-turn query, prompt injection hardening
- [x] **Phase 7: Infrastructure Reliability** — Message dedup, Redis 503 on failure, RQ retry policy, connection pool, booking race window
- [x] **Phase 8: Security & Configuration** — Fail-fast secrets, admin API key auth, .env.example, Redis PING at startup
- [x] **Phase 9: Copy & LLM Settings** — Hardcoded response rewrites, Argentine Spanish tone, temperature + timeout tuning
- [x] **Phase 10: Evolution API Integration** — Add Evolution API as WhatsApp provider alongside Meta, keeping both integrations functional via provider config flag

---

## Phase Details

### Phase 5: Intent Detection Fixes
**Goal**: The intent detection layer correctly classifies Argentine patient messages without false matches, defaulting, or silent failures
**Depends on**: Nothing (pure logic fixes, no external dependencies)
**Requirements**: INTENT-01, INTENT-02, INTENT-03, INTENT-04, INTENT-05, INTENT-06, INTENT-07, INTENT-08
**Success Criteria** (what must be TRUE):
  1. Sending "dale" or "anotame" after slot presentation confirms the booking without ambiguity
  2. Sending "1" to select a slot does not false-match on messages containing "14:30" or "21 de abril"
  3. Sending "tengo fiebre y quiero turno" routes to scheduling, not anti-diagnostic
  4. When `is_paused=True`, the operator phone receives a notification (or a log entry clearly records the handoff event) — the response does not promise escalation that never happens
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Keyword fixes: BOOKING_CONFIRM_KEYWORDS, scheduling dead code, PAIN_URGENCY_KEYWORDS (INTENT-02, INTENT-05, INTENT-06)
- [ ] 05-02-PLAN.md — Slot ambiguity trio: _detect_slot_index None return, word-boundary regex, booking_ambiguous_slot state flag + generation clarification (INTENT-01, INTENT-03, INTENT-08)
- [ ] 05-03-PLAN.md — Graph routing + handoff node: scheduling-intent override for anti-diagnostic, handoff_node wiring (INTENT-04, INTENT-07)

### Phase 6: RAG Quality
**Goal**: RAG retrieval returns only relevant, deduplicated context and handles missing context gracefully without pausing the thread
**Depends on**: Phase 5 (agent state must be stable before tuning retrieval behavior)
**Requirements**: RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, RAG-06
**Success Criteria** (what must be TRUE):
  1. After re-uploading a knowledge base document, the chunk count in Supabase does not increase (old chunks are replaced)
  2. A follow-up question like "¿y cuánto sale?" retrieves correct context without requiring the patient to repeat the topic
  3. When no chunk clears the 0.60 similarity threshold, the agent responds using the system prompt alone rather than pausing the thread
  4. RAG context injected into the prompt is wrapped in XML delimiters and an explicit anti-injection instruction is present
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Similarity threshold + dedup DELETE + chunk size reduction (RAG-01, RAG-03, RAG-04)
- [ ] 06-02-PLAN.md — Remove binary confidence pause + multi-turn query builder (RAG-02, RAG-05)
- [ ] 06-03-PLAN.md — XML delimiters + anti-injection instruction in RAG context injection (RAG-06)

### Phase 7: Infrastructure Reliability
**Goal**: The webhook layer and job queue handle duplicate deliveries, transient failures, and connection pressure without data loss or false errors
**Depends on**: Phase 5, Phase 6 (agent behavior stabilized before infrastructure layer is tightened)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Sending the same webhook message ID twice (simulating Meta retry) results in exactly one job enqueued and one response sent
  2. A Redis unavailability event during enqueue returns HTTP 503 (not 500) so Meta retries delivery
  3. A transient OpenAI timeout on a job automatically retries up to 3 times with backoff before failing permanently
  4. The booked appointment slot matches the slot shown to the patient (race window eliminated)
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Redis pool + 503 error handling + Retry on enqueue in _enqueue_task (INFRA-02, INFRA-03, INFRA-04)
- [x] 07-02-PLAN.md — booking_node reads state["available_slots"] first to eliminate Calendar re-fetch race (INFRA-05)
- [x] 07-03-PLAN.md — Webhook dedup via Redis SET NX before enqueue (INFRA-01)

### Phase 8: Security & Configuration
**Goal**: The application fails fast on missing secrets, admin endpoints require authentication, and all required env vars are documented
**Depends on**: Phase 7 (infrastructure must be stable before locking down configuration)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Starting the application without `OPENAI_API_KEY` set produces a clear startup error and the process exits — it does not boot with a blank key
  2. `POST /api/v1/tenants` returns 401 when called without a valid `X-API-Key` header
  3. `.env.example` lists `ADMIN_API_KEY`, `DEFAULT_SLOT_DURATION_MINUTES`, and `SCHEDULING_LOOKAHEAD_HOURS`
  4. Starting the application with a misconfigured `REDIS_URL` fails at boot with a clear error, not at first request
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — Config hardening: remove blank defaults from secrets, add ADMIN_API_KEY field, update .env.example (SEC-01, SEC-03)
- [x] 08-02-PLAN.md — Admin API auth: X-API-Key guard on POST /tenants and PATCH /tenants/{id}/rules (SEC-02)
- [x] 08-03-PLAN.md — Redis startup PING in lifespan — hard fail on misconfigured REDIS_URL (SEC-04)

### Phase 9: Copy & LLM Settings
**Goal**: All patient-facing hardcoded responses use natural Argentine Spanish and the LLM is tuned for determinism and responsiveness
**Depends on**: Phase 5, Phase 8 (intent and config must be stable; copy changes depend on correct routing)
**Requirements**: COPY-01, COPY-02, COPY-03, COPY-04, COPY-05
**Success Criteria** (what must be TRUE):
  1. The anti-diagnostic response contains "te soy sincero" and contains no gendered slash constructions
  2. The low-confidence pause response tells the patient to call the clinic directly — it contains no promise of human escalation
  3. The shadow mode response specifies "por teléfono o de forma presencial" (not "canales habituales")
  4. LLM responses are generated with temperature 0.3 and a 20-second timeout is enforced on the OpenAI call
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Patient-facing copy rewrites: ANTI_DIAGNOSTIC_RESPONSE, LOW_CONFIDENCE_PAUSE_RESPONSE, SHADOW_MODE_REDIRECT_RESPONSE (COPY-01, COPY-02, COPY-03)
- [x] 09-02-PLAN.md — System prompt accents + voseo fix + ChatOpenAI temperature=0.3 + request_timeout=20 (COPY-04, COPY-05)

---

### Phase 10: Evolution API Integration
**Goal**: The system can receive and send WhatsApp messages via Evolution API as an alternative to Meta Cloud API, selectable per-deployment via a config flag, with both providers coexisting in the codebase
**Depends on**: Phase 9 (stable codebase before adding new provider layer)
**Requirements**: EVOL-01, EVOL-02, EVOL-03, EVOL-04, EVOL-05
**Success Criteria** (what must be TRUE):
  1. Setting `WHATSAPP_PROVIDER=evolution` routes all incoming webhooks through the Evolution handler
  2. Setting `WHATSAPP_PROVIDER=meta` keeps existing Meta behavior unchanged
  3. A message sent via Evolution webhook reaches the LangGraph agent and produces a reply sent back via Evolution API
  4. Meta webhook endpoint continues to pass all existing tests unchanged
  5. Evolution API base URL, API key, and instance name are configurable via env vars
**Plans**: 3 plans

Plans:
- [x] 10-01-PLAN.md — Config fields (WHATSAPP_PROVIDER, EVOLUTION_*) + evolution_service.py send layer (EVOL-05, EVOL-02)
- [x] 10-02-PLAN.md — Evolution webhook endpoint + payload normalizer + endpoint tests (EVOL-01, EVOL-04)
- [x] 10-03-PLAN.md — tasks.py provider dispatch + full regression gate (EVOL-03, EVOL-04)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Intent Detection Fixes | 3/3 | Complete | 2026-04-04 |
| 6. RAG Quality | 3/3 | Complete | 2026-04-04 |
| 7. Infrastructure Reliability | 3/3 | Complete | 2026-04-04 |
| 8. Security & Configuration | 3/3 | Complete | 2026-04-04 |
| 9. Copy & LLM Settings | 2/2 | Complete | 2026-04-04 |
| 10. Evolution API Integration | 0/? | Planned | — |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INTENT-01 | Phase 5 |
| INTENT-02 | Phase 5 |
| INTENT-03 | Phase 5 |
| INTENT-04 | Phase 5 |
| INTENT-05 | Phase 5 |
| INTENT-06 | Phase 5 |
| INTENT-07 | Phase 5 |
| INTENT-08 | Phase 5 |
| RAG-01 | Phase 6 |
| RAG-02 | Phase 6 |
| RAG-03 | Phase 6 |
| RAG-04 | Phase 6 |
| RAG-05 | Phase 6 |
| RAG-06 | Phase 6 |
| INFRA-01 | Phase 7 |
| INFRA-02 | Phase 7 |
| INFRA-03 | Phase 7 |
| INFRA-04 | Phase 7 |
| INFRA-05 | Phase 7 |
| SEC-01 | Phase 8 |
| SEC-02 | Phase 8 |
| SEC-03 | Phase 8 |
| SEC-04 | Phase 8 |
| COPY-01 | Phase 9 |
| COPY-02 | Phase 9 |
| COPY-03 | Phase 9 |
| COPY-04 | Phase 9 |
| COPY-05 | Phase 9 |
| EVOL-01 | Phase 10 |
| EVOL-02 | Phase 10 |
| EVOL-03 | Phase 10 |
| EVOL-04 | Phase 10 |
| EVOL-05 | Phase 10 |

---

*Last updated: 2026-04-04 | Milestone: v1.1 Production Hardening*

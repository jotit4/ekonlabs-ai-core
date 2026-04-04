---
phase: "07"
plan: "01"
subsystem: "webhooks"
tags: [redis, rq, reliability, tdd, infra]
dependency_graph:
  requires: []
  provides: [INFRA-02, INFRA-03, INFRA-04]
  affects: [app/api/v1/webhooks.py]
tech_stack:
  added: [rq.Retry]
  patterns: [module-level connection pool, lazy init, try/except AppException]
key_files:
  created: []
  modified:
    - app/api/v1/webhooks.py
    - tests/test_api/test_webhooks.py
decisions:
  - "Module-level _redis_pool with lazy init mirrors rag_service.py pattern for consistency"
  - "Catch bare Exception (not just RedisConnectionError) so any enqueue failure yields 503"
  - "Retry intervals [10, 30, 60] seconds match plan spec exactly"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-04T18:11:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 07 Plan 01: Harden `_enqueue_task` — Redis Pool + 503 + Retry Summary

Module-level Redis connection pool with lazy init, 503 AppException on Redis failure, and Retry(max=3, intervals=[10,30,60]) on every RQ enqueue call.

## What Was Built

Three atomic hardening changes to `_enqueue_task` in `app/api/v1/webhooks.py`:

**INFRA-04 — Redis connection pool:** Replaced per-request `Redis.from_url()` with a module-level `_redis_pool` variable and `_get_redis_pool()` lazy initializer. Redis client is created once and reused across requests, eliminating TCP handshake overhead per webhook.

**INFRA-02 — 503 on Redis failure:** Wrapped the entire enqueue block in `try/except Exception`. Any failure (connection refused, timeout, etc.) raises `AppException(code="REDIS_UNAVAILABLE", status_code=503)`. Meta's webhook delivery system will retry on 5xx responses, giving the infrastructure time to recover.

**INFRA-03 — Automatic retry with backoff:** Added `retry=Retry(max=3, interval=[10, 30, 60])` to every `q.enqueue()` call. RQ will re-attempt the worker task up to 3 times with 10s / 30s / 60s delays before marking the job as failed.

## TDD Execution

### RED Phase (commit caea906)
Added 4 failing tests to `tests/test_api/test_webhooks.py`:
- `test_enqueue_task_raises_503_on_redis_error` — AppException with status 503 + code REDIS_UNAVAILABLE
- `test_enqueue_task_503_propagates_to_endpoint` — HTTP 503 from the POST endpoint
- `test_enqueue_task_uses_retry_object` — Retry(max=3, intervals=[10,30,60]) present in enqueue kwargs
- `test_enqueue_task_reuses_pool` — Redis.from_url called exactly once across two _enqueue_task calls

All 4 failed as expected (AttributeError: module has no attribute `_get_redis_pool`).

### GREEN Phase (commit 748db4a)
- Added `Retry` to rq import
- Added `_redis_pool: Redis | None = None` and `_get_redis_pool()` at module level
- Replaced `_enqueue_task` body with try/except + pool + Retry

Result: 14/14 tests passing (10 pre-existing + 4 new).

## Verification

```
pytest tests/test_api/test_webhooks.py -v
14 passed, 1 warning
```

```
python -c "
src = open('app/api/v1/webhooks.py').read()
assert '_redis_pool' in src
assert 'Retry(max=3' in src
assert 'REDIS_UNAVAILABLE' in src
print('07-01 checks OK')
"
# Output: 07-01 checks OK
```

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash    | Type  | Description                                              |
|---------|-------|----------------------------------------------------------|
| caea906 | test  | Add failing tests for Redis pool, 503, and Retry (RED)  |
| 748db4a | feat  | Harden _enqueue_task with Redis pool, 503, and Retry (GREEN) |

## Self-Check: PASSED

- [x] `app/api/v1/webhooks.py` modified and contains `_redis_pool`, `Retry(max=3`, `REDIS_UNAVAILABLE`
- [x] `tests/test_api/test_webhooks.py` modified with 4 new tests
- [x] Commit caea906 exists (RED)
- [x] Commit 748db4a exists (GREEN)
- [x] 14/14 tests pass

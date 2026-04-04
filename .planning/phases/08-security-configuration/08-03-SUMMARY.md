---
phase: "08"
plan: "03"
subsystem: startup-resilience
tags: [redis, lifespan, startup, sec-04]
requires: [08-01]
provides: [redis-startup-ping]
affects: [app/main.py]
tech-stack:
  added: []
  patterns: [fail-fast-startup, connection-verification]
key-files:
  created: []
  modified:
    - app/main.py
    - tests/test_api/test_tenants.py
decisions:
  - "Redis PING hard-raises on failure so app never starts with a bad REDIS_URL"
  - "Redis client is closed in a finally block to avoid connection leak"
  - "Test suite fixed: 08-01 added ADMIN_API_KEY enforcement but left 6 tenant tests without the required header"
metrics:
  duration: "~18 minutes"
  completed: "2026-04-04"
  tasks_completed: 2
  files_modified: 2
requirements: [SEC-04]
---

# Phase 08 Plan 03: Redis Startup PING Summary

**One-liner:** Redis PING added to FastAPI lifespan before yield — hard-raises on bad REDIS_URL at boot rather than at first request.

**Status:** Complete
**Date:** 2026-04-04

## Changes Made

- `app/main.py`: Added `from redis import Redis` import (after slowapi imports, before local app imports). Added Redis PING block in `lifespan` after the Supabase connectivity check and before the final `yield`. On failure: logs error and raises — app does not start. Redis client closed in `finally` block.

## Test Result

326 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tenant tests broken by 08-01 auth gate**

- **Found during:** Task 2 (pytest run)
- **Issue:** Plan 08-01 added `_require_admin_api_key` dependency to `POST /tenants` and `PATCH /tenants/{id}/rules` but did not update the 6 test cases that call these endpoints expecting 201/200/422/404. All returned 401 instead.
- **Fix:** Added `headers={"X-API-Key": "test-admin-key-for-tests-only"}` to the success-path and validation tests that need to reach the endpoint body. The two explicit 401 tests (testing the no-key scenario) were left unchanged.
- **Files modified:** `tests/test_api/test_tenants.py`
- **Commit:** 5676750

## Key Decisions

- Redis PING hard-raises so the process exits immediately on misconfigured `REDIS_URL` — no silent degradation.
- `socket_connect_timeout=3` prevents indefinite hangs during startup.
- The `APP_ENV in {"test", "testing"}` guard (line 25-28) already causes the entire lifespan body to be skipped in tests, so no test infrastructure changes were needed for the Redis block itself.

## Self-Check: PASSED

- `app/main.py` exists and contains all required Redis PING elements (spot-check verified).
- Commits `5d2c8a5` and `5676750` confirmed in git log.
- 326 tests pass.

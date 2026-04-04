---
phase: 7
plan: 3
subsystem: webhooks
tags: [idempotency, redis, dedup, infra, tdd]
dependency_graph:
  requires: [07-01, 07-02]
  provides: [INFRA-01]
  affects: [app/api/v1/webhooks.py]
tech_stack:
  added: []
  patterns: [redis-set-nx, at-least-once-dedup, tdd-red-green]
key_files:
  created: []
  modified:
    - app/api/v1/webhooks.py
    - tests/test_api/test_webhooks.py
decisions:
  - "Dedup block placed after display_phone extraction (step 4b) but before tenant resolution (step 5) — avoids a DB lookup for confirmed duplicates"
  - "asyncio.to_thread wraps the synchronous Redis SET call to avoid blocking the async event loop"
  - "IndexError/AttributeError caught around message_id extraction — status receipts and delivery notifications without messages array skip dedup silently"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-04"
  tasks_completed: 1
  files_modified: 2
---

# Phase 7 Plan 3: Webhook Idempotency via Redis SET NX Summary

**One-liner:** Redis SET NX with 24h TTL on `webhook:dedup:{message_id}` silently discards duplicate Meta webhook deliveries before tenant resolution.

## What Was Built

Added an idempotency guard (INFRA-01) to `receive_whatsapp_webhook` in `app/api/v1/webhooks.py`. Meta guarantees at-least-once delivery, meaning the same message can arrive multiple times. Before this change, each delivery would enqueue a separate `process_whatsapp_message` job, potentially booking the same appointment twice.

The dedup block runs after HMAC validation and Pydantic parse, but before tenant resolution. It extracts `messages[0].id` from the payload, constructs a key `webhook:dedup:{message_id}`, and calls `Redis.set(key, 1, nx=True, ex=86400)`. Redis SET NX returns `True` on the first delivery (key did not exist) and `None` on subsequent deliveries (key already exists). Duplicates get an immediate 200 response without touching the queue or the database.

## TDD Execution

**RED phase:** Added 3 failing tests confirming dedup logic does not yet exist:
- `test_duplicate_message_id_returns_200_without_enqueue` — assert `mock_enqueue.call_count == 1` failed with count=2
- `test_first_delivery_enqueues_job` — passed trivially (bug: would pass even without dedup)
- `test_dedup_key_uses_message_id` — failed (no SET call at all)

**GREEN phase:** Implemented dedup block. All 17 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two pre-existing tests lacked `_get_redis_pool` mock**

- **Found during:** GREEN verification pass
- **Issue:** `test_webhook_post_returns_200_when_tenant_not_found` and `test_webhook_post_standard_response_format` use a full-messages payload. After implementing the dedup block, these tests hit `_get_redis_pool()` which calls `Redis.from_url("memory://")` — an invalid Redis URL in the test environment — raising `ValueError`.
- **Fix:** Added `patch("app.api.v1.webhooks._get_redis_pool", return_value=mock_redis)` with `mock_redis.set.return_value = True` to both tests' context managers.
- **Files modified:** `tests/test_api/test_webhooks.py`
- **Commit:** b4b2ea8 (included in same task commit)

## Test Results

```
17 passed, 1 warning in 1.79s
```

All 17 tests pass: 14 from 07-01/07-02 + 3 new dedup tests.

## Self-Check: PASSED

- `app/api/v1/webhooks.py` contains `nx=True`, `ex=86400`, `webhook:dedup:` — verified
- `tests/test_api/test_webhooks.py` contains all 3 new test functions — verified
- Commit b4b2ea8 exists — verified
- 17/17 tests pass

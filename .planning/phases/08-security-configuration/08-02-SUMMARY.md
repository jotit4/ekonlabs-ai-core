# 08-02 Summary - Admin API Auth (SEC-02)

**Status:** Complete
**Date:** 2026-04-04

## Changes Made
- app/api/v1/tenants.py: Added _require_admin_api_key Depends to POST /tenants and PATCH /tenants/{id}/rules
- tests/test_api/test_tenants.py: Added 2 new 401 tests; updated all 6 existing tests with valid X-API-Key header

## Test Result
326 tests pass. All 8 tenant tests pass (6 updated + 2 new 401 tests).

## Commits
- 198a7e0: feat(08-02): add _require_admin_api_key dependency to admin endpoints
- 9f6cd21: test(08-02): update existing tenant tests with valid X-API-Key header

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FastAPI 0.135+ resolves Depends before path param validation**
- **Found during:** Task 3
- **Issue:** The plan stated that test_patch_tenant_rules_returns_422_on_invalid_uuid did NOT need
  the X-API-Key header because FastAPI validates UUID path params before running Depends.
  In FastAPI 0.135.1 (the installed version), Depends runs before path parameter validation,
  so requests without a valid key return 401 before reaching UUID validation.
- **Fix:** Added headers={"X-API-Key": "test-admin-key-for-tests-only"} to
  test_patch_tenant_rules_returns_422_on_invalid_uuid as well. The test still correctly
  asserts 422 — the auth guard simply runs first and passes before UUID validation fires.
- **Files modified:** tests/test_api/test_tenants.py
- **Commit:** 9f6cd21

## Key Decisions
- Used Optional[str] = Header(default=None, alias="X-API-Key") so that missing header
  returns 401 rather than FastAPI's default 422 for missing required headers.
- Single reusable dependency function (_require_admin_api_key) applied to both endpoints
  via Depends — consistent pattern for future admin endpoints.

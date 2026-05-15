-- Migration: tenants.uses_native_calendar — flag para activar calendario nativo por tenant
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16

-- ── tenants: uses_native_calendar ─────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS uses_native_calendar BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tenants.uses_native_calendar
  IS 'Cuando TRUE: usa availability_service.py nativo. Cuando FALSE: usa calendar_service.py (Google Calendar). Retrocompatibilidad garantizada.';

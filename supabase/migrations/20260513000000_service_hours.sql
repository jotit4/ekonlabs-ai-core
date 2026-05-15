-- Migration: service_hours + service_exceptions
-- Story 6.4 — Horarios de Atención por Servicio
-- 2026-05-13

-- ── Tabla service_hours ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_hours (
  hour_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            UUID        NOT NULL REFERENCES public.services(service_id) ON DELETE CASCADE,
  tenant_id             UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  day_of_week           SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=domingo, 6=sábado
  start_time            TIME        NOT NULL,
  end_time              TIME        NOT NULL,
  slot_duration_minutes INT         NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0),
  active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT check_end_after_start CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_service_hours_service ON public.service_hours(service_id, active);
CREATE INDEX IF NOT EXISTS idx_service_hours_tenant  ON public.service_hours(tenant_id);

ALTER TABLE public.service_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_hours_select_own ON public.service_hours;
CREATE POLICY service_hours_select_own
  ON public.service_hours FOR SELECT TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS service_hours_insert_own ON public.service_hours;
CREATE POLICY service_hours_insert_own
  ON public.service_hours FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS service_hours_update_own ON public.service_hours;
CREATE POLICY service_hours_update_own
  ON public.service_hours FOR UPDATE TO authenticated
  USING  (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS service_hours_delete_own ON public.service_hours;
CREATE POLICY service_hours_delete_own
  ON public.service_hours FOR DELETE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

REVOKE ALL ON TABLE public.service_hours FROM anon;

-- ── Tabla service_exceptions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_exceptions (
  exception_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      UUID        NOT NULL REFERENCES public.services(service_id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  exception_date  DATE        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(service_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_service_exceptions_service ON public.service_exceptions(service_id, exception_date);
CREATE INDEX IF NOT EXISTS idx_service_exceptions_tenant  ON public.service_exceptions(tenant_id);

ALTER TABLE public.service_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_exceptions_select_own ON public.service_exceptions;
CREATE POLICY service_exceptions_select_own
  ON public.service_exceptions FOR SELECT TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS service_exceptions_insert_own ON public.service_exceptions;
CREATE POLICY service_exceptions_insert_own
  ON public.service_exceptions FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS service_exceptions_delete_own ON public.service_exceptions;
CREATE POLICY service_exceptions_delete_own
  ON public.service_exceptions FOR DELETE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

REVOKE ALL ON TABLE public.service_exceptions FROM anon;

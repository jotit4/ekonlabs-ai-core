-- Migration: blocked_times — períodos de bloqueo por profesional (vacaciones, licencias, etc.)
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16

-- ── Tabla blocked_times ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blocked_times (
  block_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(professional_id) ON DELETE CASCADE,
  date_from       DATE NOT NULL,
  date_to         DATE NOT NULL,
  reason          TEXT,
  CONSTRAINT check_blocked_date_order CHECK (date_from <= date_to)
);

CREATE INDEX IF NOT EXISTS idx_blocked_times_professional ON public.blocked_times(professional_id, date_from, date_to);

ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation via JOIN a professionals (tabla sin tenant_id directo)
DROP POLICY IF EXISTS blocked_times_select_own ON public.blocked_times;
CREATE POLICY blocked_times_select_own
  ON public.blocked_times FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
  );

-- INSERT / UPDATE / DELETE: se implementan en Story 9.2 (solo admins)

REVOKE ALL ON TABLE public.blocked_times FROM anon;

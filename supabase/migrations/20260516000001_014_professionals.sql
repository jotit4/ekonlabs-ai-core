-- Migration: professionals — tabla de profesionales del tenant
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16

-- ── Tabla professionals ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.professionals (
  professional_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- email único globalmente (un profesional puede atender en un solo tenant)
CREATE UNIQUE INDEX IF NOT EXISTS professionals_email_unique ON public.professionals(email);

CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON public.professionals(tenant_id, active);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado del mismo tenant
DROP POLICY IF EXISTS professionals_select_own ON public.professionals;
CREATE POLICY professionals_select_own
  ON public.professionals FOR SELECT TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- INSERT / UPDATE / DELETE: se implementan en Story 9.2 (solo admins)
-- No agregar aquí para evitar colisiones con la siguiente story.

REVOKE ALL ON TABLE public.professionals FROM anon;

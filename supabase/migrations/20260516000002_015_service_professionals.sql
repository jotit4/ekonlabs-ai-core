-- Migration: service_professionals — relación N:M entre servicios y profesionales
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16

-- ── Tabla service_professionals ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_professionals (
  service_id      UUID NOT NULL REFERENCES public.services(service_id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(professional_id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_professional ON public.service_professionals(professional_id);

ALTER TABLE public.service_professionals ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation via JOIN a professionals (tabla sin tenant_id directo)
DROP POLICY IF EXISTS service_professionals_select_own ON public.service_professionals;
CREATE POLICY service_professionals_select_own
  ON public.service_professionals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
  );

-- INSERT / UPDATE / DELETE: se implementan en Story 9.2 (solo admins)

REVOKE ALL ON TABLE public.service_professionals FROM anon;

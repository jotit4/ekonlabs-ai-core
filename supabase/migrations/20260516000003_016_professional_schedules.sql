-- Migration: professional_schedules — horarios semanales por profesional
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16
--
-- NOTA day_of_week: 0=Lunes … 6=Domingo (ISO week notation, diseño aprobado en design-native-calendar.md)
-- DIFERENTE de service_hours donde 0=Domingo. Incluir comentario en columna para claridad.

-- ── Tabla professional_schedules ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.professional_schedules (
  schedule_id     UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID     NOT NULL REFERENCES public.professionals(professional_id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Lunes, 1=Martes, …, 6=Domingo (ISO week)
  start_time      TIME     NOT NULL,
  end_time        TIME     NOT NULL,
  CONSTRAINT check_schedule_end_after_start CHECK (end_time > start_time),
  -- UNIQUE para permitir ON CONFLICT en seed migration (020)
  CONSTRAINT professional_schedules_unique_slot UNIQUE (professional_id, day_of_week, start_time)
);

COMMENT ON COLUMN public.professional_schedules.day_of_week
  IS '0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves, 4=Viernes, 5=Sábado, 6=Domingo (ISO week notation). DIFERENTE de service_hours donde 0=Domingo.';

CREATE INDEX IF NOT EXISTS idx_professional_schedules_professional ON public.professional_schedules(professional_id);

ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation via JOIN a professionals (tabla sin tenant_id directo)
DROP POLICY IF EXISTS professional_schedules_select_own ON public.professional_schedules;
CREATE POLICY professional_schedules_select_own
  ON public.professional_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
  );

-- INSERT / UPDATE / DELETE: se implementan en Story 9.2 (solo admins)

REVOKE ALL ON TABLE public.professional_schedules FROM anon;

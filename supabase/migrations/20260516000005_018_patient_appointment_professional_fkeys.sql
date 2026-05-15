-- Migration: agregar foreign keys a professionals en patients y appointments
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16
--
-- ON DELETE SET NULL: si se elimina un profesional, appointments y patients históricos
-- NO se borran — solo pierden la referencia. Correcto para auditoría médica.

-- ── patients: preferred_professional_id ──────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS preferred_professional_id UUID
    REFERENCES public.professionals(professional_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_preferred_professional
  ON public.patients(preferred_professional_id)
  WHERE preferred_professional_id IS NOT NULL;

-- ── appointments: professional_id ─────────────────────────────────────────────

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS professional_id UUID
    REFERENCES public.professionals(professional_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_professional
  ON public.appointments(professional_id)
  WHERE professional_id IS NOT NULL;

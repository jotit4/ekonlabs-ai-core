-- Migration 037: appointments.package_id + session_index (Epic 13 — Paquetes de sesiones)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.3.
--
-- Aditiva e idempotente (ADD COLUMN IF NOT EXISTS). Liga cada turno generado a su tratamiento.
-- La generación automática de turnos (Story 13.3) llenará package_id / session_index.
--
-- ⚠️ NO altera el candado anti-overbooking POR PROFESIONAL (migración 029,
-- idx_appointments_no_overlap_professional), ni el CHECK de `status`, ni ninguna otra
-- columna/constraint existente de appointments. Puramente aditiva.
--
-- DB-only. NO se aplica automáticamente: el usuario la aplica en EasyPanel.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.treatments(treatment_id) ON DELETE SET NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS session_index integer;  -- 1..N: posición de la sesión en la serie

-- Índice parcial: solo turnos que pertenecen a una serie.
CREATE INDEX IF NOT EXISTS idx_appointments_package
  ON public.appointments (package_id) WHERE package_id IS NOT NULL;

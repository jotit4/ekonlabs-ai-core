-- Migration: 007_patient_deletion_fields
-- Agrega columnas de eliminación con período de gracia a la tabla patients.
-- NO se modifica ninguna política RLS existente — las de 20260511000000_patients_rls.sql ya cubren correctamente.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_effective_at  TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.patients.deletion_requested_at IS
  'Timestamp de solicitud de eliminación por admin (NULL = sin solicitud pendiente)';

COMMENT ON COLUMN public.patients.deletion_effective_at IS
  'Fecha efectiva de eliminación = deletion_requested_at + 30 días (procesada por job backend)';

-- Índice parcial para queries de pacientes pendientes de eliminación
CREATE INDEX IF NOT EXISTS idx_patients_deletion_pending
  ON public.patients (tenant_id, deletion_effective_at)
  WHERE deletion_requested_at IS NOT NULL;

-- Migration 042: Campos clínicos estructurados en `patients` (Epic 14 — HCE, §3.6)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.6.
--
-- Puramente ADITIVA: solo ADD COLUMN IF NOT EXISTS. Tipo text (decisión §3.6: el contrato
-- dejaba "text o jsonb" a la story; se elige text — coherente con los textareas simples
-- de 14.4 y con notes/reason_for_visit existentes).
--
-- NO se modifican las policies RLS de `patients`: receptionist necesita seguir viendo y
-- editando la fila del paciente (datos administrativos). La restricción doctor/admin
-- sobre ESTOS 3 CAMPOS no puede hacerse con RLS (que es por fila, no por columna) —
-- se aplica en la API Route + frontend de la Story 14.4.
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS antecedentes text,
  ADD COLUMN IF NOT EXISTS alergias     text,
  ADD COLUMN IF NOT EXISTS medicacion   text;

COMMENT ON COLUMN public.patients.antecedentes IS 'Antecedentes clínicos estructurados (HCE Epic 14, edita doctor/admin via API)';
COMMENT ON COLUMN public.patients.alergias     IS 'Alergias del paciente (HCE Epic 14)';
COMMENT ON COLUMN public.patients.medicacion   IS 'Medicación actual del paciente (HCE Epic 14)';

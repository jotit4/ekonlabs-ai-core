-- Migration 047: Campos de cabecera de la ficha kinesiológica en papel (ISADI) — Fase 1
-- Esquema AUTORITATIVO: instrucción de digitalización de la ficha de admisión (2026-07-07).
--
-- Puramente ADITIVA: solo ADD COLUMN IF NOT EXISTS. Tipo text para los campos libres
-- (coherente con notes/reason_for_visit/antecedentes existentes) y uuid + FK para
-- primary_professional_id (KLGO a cargo).
--
-- Campos ADMINISTRATIVOS (visibles/editables por receptionist y admin, igual que el
-- resto de `patients`): lugar, ocupacion, derivacion, actividad_fisica,
-- primary_professional_id.
--
-- Campo CLÍNICO (mismo tratamiento que antecedentes/alergias/medicacion de la
-- migración 042 — HCE, Ley 25.326, solo doctor/admin vía /api/patients/[id]/clinical-data):
-- cirugias.
--
-- NO se modifican las policies RLS de `patients`: la restricción de rol sobre el
-- campo clínico `cirugias` no puede hacerse con RLS (que es por fila, no por
-- columna) — se aplica en la API Route + frontend, igual que 042.
--
-- primary_professional_id referencia a professionals(professional_id) ON DELETE SET NULL:
-- si se borra/desactiva el profesional, el paciente no debe quedar en un estado
-- inconsistente ni bloquear el DELETE.
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS lugar             text,
  ADD COLUMN IF NOT EXISTS ocupacion         text,
  ADD COLUMN IF NOT EXISTS derivacion        text,
  ADD COLUMN IF NOT EXISTS actividad_fisica  text,
  ADD COLUMN IF NOT EXISTS cirugias          text,
  ADD COLUMN IF NOT EXISTS primary_professional_id uuid
    REFERENCES public.professionals(professional_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patients.lugar             IS 'Lugar de nacimiento/residencia (ficha de admisión — administrativo)';
COMMENT ON COLUMN public.patients.ocupacion         IS 'Ocupación del paciente (ficha de admisión — administrativo)';
COMMENT ON COLUMN public.patients.derivacion        IS 'Quién derivó al paciente (ficha de admisión — administrativo)';
COMMENT ON COLUMN public.patients.actividad_fisica  IS 'Actividad física del paciente (ficha de admisión — administrativo)';
COMMENT ON COLUMN public.patients.primary_professional_id IS 'KLGO a cargo — profesional responsable del paciente (administrativo, nullable, SET NULL si se borra el profesional)';
COMMENT ON COLUMN public.patients.cirugias          IS 'Cirugías previas del paciente (HCE — Ley 25.326, edita doctor/admin via API, igual que antecedentes/alergias/medicacion)';

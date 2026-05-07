-- Migration 013: campos adicionales de paciente requeridos por ISADI
-- obra_social y obra_social_number ya existen (migration 005)
-- Se agregan: motivo de consulta, teléfono alternativo y dirección

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS reason_for_visit TEXT,
    ADD COLUMN IF NOT EXISTS alternative_phone TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.patients.reason_for_visit IS 'Motivo de consulta / diagnóstico — capturado al agendar';
COMMENT ON COLUMN public.patients.alternative_phone IS 'Teléfono alternativo de contacto';
COMMENT ON COLUMN public.patients.address IS 'Dirección del paciente';;

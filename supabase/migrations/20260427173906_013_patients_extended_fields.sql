
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS reason_for_visit  TEXT,
    ADD COLUMN IF NOT EXISTS alternative_phone TEXT,
    ADD COLUMN IF NOT EXISTS address           TEXT;

COMMENT ON COLUMN public.patients.reason_for_visit  IS 'Motivo de la consulta (capturado en Phase D del flujo de registro)';
COMMENT ON COLUMN public.patients.alternative_phone IS 'Teléfono alternativo de contacto';
COMMENT ON COLUMN public.patients.address           IS 'Domicilio del paciente';
;

-- Agrega FK de thread_states → patients(tenant_id, phone_number)
-- Necesario para que PostgREST resuelva el embedded resource en la query de pacientes.
-- Elimina registros huérfanos (sin patient) antes de agregar la constraint.

DELETE FROM public.thread_states ts
WHERE NOT EXISTS (
  SELECT 1 FROM public.patients p
  WHERE p.tenant_id = ts.tenant_id
    AND p.phone_number = ts.phone_number
);

ALTER TABLE public.thread_states
  ADD CONSTRAINT thread_states_patient_fkey
  FOREIGN KEY (tenant_id, phone_number)
  REFERENCES public.patients(tenant_id, phone_number)
  ON DELETE CASCADE;

-- Migration 006: Clinical Notes
-- Tabla de notas clínicas con RLS — solo doctor y admin

CREATE TABLE IF NOT EXISTS public.clinical_notes (
  note_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(tenant_id),
  patient_id uuid        NOT NULL REFERENCES public.patients(patient_id),
  author_id  uuid        NOT NULL REFERENCES auth.users(id),
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para historial de paciente (query frecuente)
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_created
  ON public.clinical_notes (tenant_id, patient_id, created_at DESC);

ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;

-- Solo doctor y admin del mismo tenant pueden leer
CREATE POLICY "clinical_notes_select_own"
  ON public.clinical_notes FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    auth.jwt() ->> 'role' IN ('doctor', 'admin')
  );

-- Solo doctor y admin pueden insertar (author_id = uid del usuario)
CREATE POLICY "clinical_notes_insert_own"
  ON public.clinical_notes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    author_id = auth.uid() AND
    auth.jwt() ->> 'role' IN ('doctor', 'admin')
  );

-- El autor o cualquier admin del tenant puede actualizar
CREATE POLICY "clinical_notes_update_own"
  ON public.clinical_notes FOR UPDATE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    (author_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin')
  )
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    (author_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin')
  );

-- Sin policy DELETE — notas son append-mostly en MVP

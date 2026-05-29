-- Migration 028: Patient Documents (Epic 11 — repositorio de documentos del paciente)
-- Tabla de documentos administrativos/clínicos del paciente con RLS + bucket privado.
-- Datos de salud (Ley 25.326, categoría sensible) → mínimo privilegio:
-- bucket privado, signed URLs de corta duración, RLS por tenant + rol, DELETE bloqueado.
--
-- Claim de rol: el canónico es 'app_role' (ver 20260515000001_fix_jwt_claim_app_role.sql);
-- se usa coalesce(app_role, role) por robustez ante tokens emitidos antes del fix.

-- ─── Tabla ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_documents (
  document_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  patient_id   uuid        NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  mime_type    text        NOT NULL,
  size_bytes   integer     NOT NULL,
  source       text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','whatsapp')),
  uploaded_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_created
  ON public.patient_documents (tenant_id, patient_id, created_at DESC);

-- ─── RLS de la tabla ────────────────────────────────────────────────────────

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: receptionist/doctor/admin del mismo tenant
CREATE POLICY "patient_documents_select_own"
  ON public.patient_documents FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- INSERT: receptionist/doctor/admin del mismo tenant
CREATE POLICY "patient_documents_insert_own"
  ON public.patient_documents FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- DELETE: bloqueado por diseño legal (igual que patients_delete_restricted)
CREATE POLICY "patient_documents_delete_restricted"
  ON public.patient_documents FOR DELETE TO authenticated
  USING (false);

-- Sin policy UPDATE — los documentos son inmutables.

-- ─── Bucket privado de Storage ──────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-documents', 'patient-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Policies sobre storage.objects ─────────────────────────────────────────
-- Ruta: {tenant_id}/{patient_id}/{document_id}_{filename}
-- storage.foldername(name)[1] = primer segmento = tenant_id (1-indexed en Postgres).

CREATE POLICY "patient_documents_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-documents' AND
    (storage.foldername(name))[1] = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

CREATE POLICY "patient_documents_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-documents' AND
    (storage.foldername(name))[1] = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- Sin policy DELETE en storage.objects para este bucket → bloqueado.

-- Migration 041: Tabla `session_notes` (Epic 14 — Historia Clínica Estructurada)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.5.
--
-- La EVOLUCIÓN POR SESIÓN liga a la sesión concreta (appointment): 1 evolución por
-- appointment (diagrama §2 del domain doc). `treatment_id` es NULLABLE porque un turno
-- suelto sin paquete TAMBIÉN puede tener evolución (AC de la Story 14.3).
-- La tabla de notas clínicas existente (006) queda INTACTA — el modelo se EXTIENDE, no se reemplaza.
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS) para poder re-correrla sin error.
--
-- Reuso: la función public.set_updated_at_timestamp() YA existe (bootstrap_core L17-25).
-- NO se redefine — solo se crea el trigger que la invoca.

-- ─── Tabla ──────────────────────────────────────────────────────────────────
-- Columnas = contrato cerrado de domain-tratamiento-clinico.md §3.5. NO agregar/renombrar.

CREATE TABLE IF NOT EXISTS public.session_notes (
  session_note_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  appointment_id  uuid        NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE,
  treatment_id    uuid        REFERENCES public.treatments(treatment_id),  -- NULLABLE: turno suelto también evoluciona (14.3)
  patient_id      uuid        NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  worked_on       text,
  progress        text,
  author_id       uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
-- UNIQUE en appointment_id implementa "1 evolución por appointment" (domain doc §2)
-- y habilita upsert ON CONFLICT (appointment_id) en 14.3.
-- (tenant_id, treatment_id) sirve la vista de evoluciones del tratamiento (14.3).

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_notes_appointment
  ON public.session_notes (appointment_id);

CREATE INDEX IF NOT EXISTS idx_session_notes_tenant_treatment
  ON public.session_notes (tenant_id, treatment_id);

-- ─── Trigger updated_at (reusa la función existente) ──────────────────────────

DROP TRIGGER IF EXISTS trg_session_notes_updated_at ON public.session_notes;
CREATE TRIGGER trg_session_notes_updated_at
BEFORE UPDATE ON public.session_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── RLS — SOLO doctor/admin (datos de salud sensibles, Ley 25.326) ───────────
-- A diferencia de `treatments` (038, agendamiento: incluye receptionist), la evolución
-- es HCE: receptionist NO accede. Misma lista de roles que la tabla de notas clínicas (006).
-- Claim canónico app_role con fallback role (ver 20260515000001_fix_jwt_claim_app_role.sql).
-- El agente Python opera con service role (bypassa RLS); estas policies aplican al dashboard.

ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_notes_select_own" ON public.session_notes;
CREATE POLICY "session_notes_select_own"
  ON public.session_notes FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "session_notes_insert_own" ON public.session_notes;
CREATE POLICY "session_notes_insert_own"
  ON public.session_notes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "session_notes_update_own" ON public.session_notes;
CREATE POLICY "session_notes_update_own"
  ON public.session_notes FOR UPDATE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  )
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "session_notes_delete_restricted" ON public.session_notes;
CREATE POLICY "session_notes_delete_restricted"
  ON public.session_notes FOR DELETE TO authenticated
  USING (false);

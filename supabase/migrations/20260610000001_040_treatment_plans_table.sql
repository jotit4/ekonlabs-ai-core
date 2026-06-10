-- Migration 040: Tabla `treatment_plans` (Epic 14 — Historia Clínica Estructurada)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.4.
--
-- El PLAN DE TRATAMIENTO es 1:1 lógico con `treatments` (Epic 13, migración 036):
-- motivo de consulta, objetivo, CIE-10 opcional, sesiones indicadas y alta (14.6).
-- La tabla de notas clínicas existente (006) queda INTACTA — el modelo se EXTIENDE, no se reemplaza.
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS) para poder re-correrla sin error.
--
-- Reuso: la función public.set_updated_at_timestamp() YA existe (bootstrap_core L17-25).
-- NO se redefine — solo se crea el trigger que la invoca.

-- ─── Tabla ──────────────────────────────────────────────────────────────────
-- Columnas = contrato cerrado de domain-tratamiento-clinico.md §3.4. NO agregar/renombrar.

CREATE TABLE IF NOT EXISTS public.treatment_plans (
  plan_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  treatment_id       uuid        NOT NULL REFERENCES public.treatments(treatment_id) ON DELETE CASCADE,  -- 1:1 lógico
  patient_id         uuid        NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  motivo_consulta    text,
  objetivo           text,
  cie10_code         text,        -- CIE-10 OPCIONAL (formato lo valida la 14.2 en Zod, NO acá)
  indicated_sessions integer,
  discharge_at       timestamptz, -- NULL = tratamiento en curso (alta = 14.6)
  discharge_report   text,
  author_id          uuid        REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
-- UNIQUE en treatment_id materializa el "1:1 lógico" del contrato (§3.4):
-- garantiza un solo plan por tratamiento y habilita upsert ON CONFLICT (treatment_id) en 14.2.

CREATE UNIQUE INDEX IF NOT EXISTS idx_treatment_plans_treatment
  ON public.treatment_plans (treatment_id);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_tenant_patient
  ON public.treatment_plans (tenant_id, patient_id);

-- ─── Trigger updated_at (reusa la función existente) ──────────────────────────

DROP TRIGGER IF EXISTS trg_treatment_plans_updated_at ON public.treatment_plans;
CREATE TRIGGER trg_treatment_plans_updated_at
BEFORE UPDATE ON public.treatment_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── RLS — SOLO doctor/admin (datos de salud sensibles, Ley 25.326) ───────────
-- A diferencia de `treatments` (038, agendamiento: incluye receptionist), el plan de
-- tratamiento es HCE: receptionist NO accede. Misma lista de roles que la tabla de notas clínicas (006).
-- Claim canónico app_role con fallback role (ver 20260515000001_fix_jwt_claim_app_role.sql).
-- El agente Python opera con service role (bypassa RLS); estas policies aplican al dashboard.

ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treatment_plans_select_own" ON public.treatment_plans;
CREATE POLICY "treatment_plans_select_own"
  ON public.treatment_plans FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "treatment_plans_insert_own" ON public.treatment_plans;
CREATE POLICY "treatment_plans_insert_own"
  ON public.treatment_plans FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "treatment_plans_update_own" ON public.treatment_plans;
CREATE POLICY "treatment_plans_update_own"
  ON public.treatment_plans FOR UPDATE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  )
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('doctor','admin')
  );

DROP POLICY IF EXISTS "treatment_plans_delete_restricted" ON public.treatment_plans;
CREATE POLICY "treatment_plans_delete_restricted"
  ON public.treatment_plans FOR DELETE TO authenticated
  USING (false);

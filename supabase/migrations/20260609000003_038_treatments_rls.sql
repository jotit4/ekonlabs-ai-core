-- Migration 038: RLS de `treatments` (Epic 13 — Paquetes de sesiones)
-- Espejo de patient_documents (migración 028), con coalesce(app_role, role).
--
-- Claim de rol: el canónico es 'app_role' (ver 20260515000001_fix_jwt_claim_app_role.sql);
-- se usa coalesce(app_role, role) por robustez ante tokens emitidos antes del fix.
--
-- Diferencia respecto a 028: aquí SÍ hay policy UPDATE — treatments es mutable
-- (sessions_remaining / status se actualizan en Stories 13.3 / 13.6). DELETE bloqueado.
--
-- El agente Python opera con service role (bypassa RLS); estas policies aplican al
-- dashboard, que usa el cliente con sesión. La generación de turnos (13.3) corre desde
-- API Routes del dashboard con sesión → INSERT/UPDATE deben permitir receptionist/doctor/admin.
--
-- Todas las policies idempotentes (DROP POLICY IF EXISTS antes de CREATE POLICY).
-- DB-only. NO se aplica automáticamente: el usuario la aplica en EasyPanel.

ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;

-- SELECT: receptionist/doctor/admin del mismo tenant
DROP POLICY IF EXISTS "treatments_select_own" ON public.treatments;
CREATE POLICY "treatments_select_own"
  ON public.treatments FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- INSERT: receptionist/doctor/admin del mismo tenant
DROP POLICY IF EXISTS "treatments_insert_own" ON public.treatments;
CREATE POLICY "treatments_insert_own"
  ON public.treatments FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- UPDATE: receptionist/doctor/admin del mismo tenant
-- Necesario: sessions_remaining / status mutan (Stories 13.3 / 13.6).
DROP POLICY IF EXISTS "treatments_update_own" ON public.treatments;
CREATE POLICY "treatments_update_own"
  ON public.treatments FOR UPDATE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  )
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role') IN ('receptionist','doctor','admin')
  );

-- DELETE: bloqueado por diseño (igual que patient_documents_delete_restricted).
DROP POLICY IF EXISTS "treatments_delete_restricted" ON public.treatments;
CREATE POLICY "treatments_delete_restricted"
  ON public.treatments FOR DELETE TO authenticated
  USING (false);

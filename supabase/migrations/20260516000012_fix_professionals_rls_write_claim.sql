-- Migration: Fix professionals + service_professionals RLS write policies
-- Bug: migrations 20260516000008 and 20260516000009 used auth.jwt() ->> 'role'
-- but the JWT emits 'app_role' after the custom_access_token_hook fix
-- (defined in 20260515000001_fix_jwt_claim_app_role.sql).
-- This caused all INSERT/UPDATE/DELETE on professionals and service_professionals to fail.
-- Drop and recreate the six policies with the corrected claim name.
--
-- Precedent: same fix applied in 20260515000003_fix_clinical_notes_rls_claim.sql

-- ── Tabla professionals — Policies de escritura (corregidas) ─────────────────

DROP POLICY IF EXISTS professionals_insert_admin ON public.professionals;
DROP POLICY IF EXISTS professionals_update_admin ON public.professionals;
DROP POLICY IF EXISTS professionals_delete_admin ON public.professionals;

-- INSERT: solo admin del mismo tenant
CREATE POLICY professionals_insert_admin
  ON public.professionals FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- UPDATE: solo admin del mismo tenant
CREATE POLICY professionals_update_admin
  ON public.professionals FOR UPDATE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- DELETE: solo admin del mismo tenant
CREATE POLICY professionals_delete_admin
  ON public.professionals FOR DELETE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- ── Tabla service_professionals — Policies de escritura (corregidas) ─────────

DROP POLICY IF EXISTS service_professionals_insert_admin ON public.service_professionals;
DROP POLICY IF EXISTS service_professionals_update_admin ON public.service_professionals;
DROP POLICY IF EXISTS service_professionals_delete_admin ON public.service_professionals;

-- INSERT: solo admin del mismo tenant (validación via JOIN a professionals)
CREATE POLICY service_professionals_insert_admin
  ON public.service_professionals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- UPDATE: solo admin del mismo tenant (validación via JOIN a professionals)
CREATE POLICY service_professionals_update_admin
  ON public.service_professionals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- DELETE: solo admin del mismo tenant (validación via JOIN a professionals)
CREATE POLICY service_professionals_delete_admin
  ON public.service_professionals FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'admin'
  );

-- Migration: Enable RLS on patients table and define tenant-scoped policies
-- Blocker fix for Story 3.2 — AC4: RLS must prevent cross-tenant access

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_select_own ON public.patients
  FOR SELECT TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

CREATE POLICY patients_insert_own ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

CREATE POLICY patients_update_own ON public.patients
  FOR UPDATE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

CREATE POLICY patients_delete_restricted ON public.patients
  FOR DELETE TO authenticated
  USING (false);

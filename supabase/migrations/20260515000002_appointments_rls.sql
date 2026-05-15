-- Migration: Enable RLS on appointments table and define tenant-scoped policies
-- Bug C-01: appointments was the only table without RLS, allowing any authenticated
-- user to read all appointments across tenants via direct PostgREST access.

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;

CREATE POLICY appointments_select_own ON public.appointments
  FOR SELECT TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

CREATE POLICY appointments_insert_own ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

CREATE POLICY appointments_update_own ON public.appointments
  FOR UPDATE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- Only admin can delete appointments directly via PostgREST
CREATE POLICY appointments_delete_admin ON public.appointments
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text = 'admin');

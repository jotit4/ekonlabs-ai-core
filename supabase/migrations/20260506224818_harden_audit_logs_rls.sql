-- Migration: harden audit_logs RLS and align policies with auth.tenant_id().
-- The audit_logs table already exists in remote migration 20260506191929.

ALTER TABLE public.audit_logs
  ALTER COLUMN tenant_id SET DEFAULT public.tenant_id();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_audit_logs_mutation() FROM authenticated, anon, public;

DROP TRIGGER IF EXISTS audit_logs_prevent_update_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_prevent_update_delete
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutation();

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    public.tenant_id() = tenant_id
  );

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.tenant_id());

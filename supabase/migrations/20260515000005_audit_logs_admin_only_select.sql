-- Migration: audit_logs SELECT restringido a admins únicamente
-- Fix: Bug C-03 — cualquier usuario autenticado del tenant podía leer audit_logs
-- Requiere: Story 8.1 completada (app_role claim correcto en JWT)

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.tenant_id()
    AND (auth.jwt() ->> 'app_role')::text = 'admin'
  );

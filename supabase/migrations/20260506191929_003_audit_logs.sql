-- Migration 003: audit_logs table
-- Append-only audit trail para cumplimiento Ley 25.326 (Argentina)
-- user_id se deriva del JWT con auth.uid(); tenant_id se deriva del claim tenant_id del JWT.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL DEFAULT auth.uid(),
  tenant_id   uuid        NOT NULL DEFAULT NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
  action      text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   text        NOT NULL,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Optimizado para queries del admin: filtrar por tenant + ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs (tenant_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo el usuario autenticado puede insertar registros de su propio tenant
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid = tenant_id
  );

-- Solo puede leer registros de su propio tenant
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id = NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid);

-- Intencionalmente SIN policies UPDATE ni DELETE -> append-only (NFR10);

-- Migration: 20260512000000_system_prompt_history.sql
-- Tabla dedicada para historial de cambios del system prompt override (Story 6.2)

CREATE TABLE IF NOT EXISTS public.system_prompt_history (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL,
  previous_content text,
  new_content      text,
  changed_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_system_prompt_history_tenant_changed
  ON public.system_prompt_history (tenant_id, changed_at DESC);

ALTER TABLE public.system_prompt_history ENABLE ROW LEVEL SECURITY;

-- SELECT: solo admins del mismo tenant
DROP POLICY IF EXISTS system_prompt_history_select_own ON public.system_prompt_history;
CREATE POLICY system_prompt_history_select_own
ON public.system_prompt_history FOR SELECT TO authenticated
USING (
  tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
  AND (auth.jwt() ->> 'app_role') = 'admin'
);

-- INSERT: solo usuarios autenticados del mismo tenant (admin-only via API Route)
DROP POLICY IF EXISTS system_prompt_history_insert_own ON public.system_prompt_history;
CREATE POLICY system_prompt_history_insert_own
ON public.system_prompt_history FOR INSERT TO authenticated
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- Sin UPDATE ni DELETE — tabla append-only (NFR10)

-- Revocar acceso anónimo
REVOKE ALL ON TABLE public.system_prompt_history FROM anon;

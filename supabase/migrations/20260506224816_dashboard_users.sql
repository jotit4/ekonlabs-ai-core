-- Migration: dashboard_users table
-- Links auth.users to tenant_id and role for JWT custom claims and RBAC.

CREATE TABLE IF NOT EXISTS public.dashboard_users (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL,
  role         text        NOT NULL CHECK (role IN ('receptionist', 'doctor', 'admin')),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_user_id ON public.dashboard_users (user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_tenant_id ON public.dashboard_users (tenant_id);

ALTER TABLE public.dashboard_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_users_own_record" ON public.dashboard_users;
CREATE POLICY "dashboard_users_own_record"
  ON public.dashboard_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dashboard_users_set_updated_at ON public.dashboard_users;
CREATE TRIGGER dashboard_users_set_updated_at
  BEFORE UPDATE ON public.dashboard_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

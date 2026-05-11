-- Migration: admin RLS para dashboard_users + columnas full_name y email
-- Permite a admins gestionar usuarios de su tenant
-- Story 1.5: Gestión de Usuarios del Tenant

-- 1. Agregar full_name a dashboard_users
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';

-- 2. Agregar email a dashboard_users (Opción B: evita join con auth.users)
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

-- 3. Policy: admin puede ver todos los usuarios de su tenant
--    (complementa la policy existente dashboard_users_own_record)
DROP POLICY IF EXISTS "dashboard_users_admin_select" ON public.dashboard_users;
CREATE POLICY "dashboard_users_admin_select"
  ON public.dashboard_users
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.tenant_id()
    AND public.user_role() = 'admin'
  );

-- 4. Policy: admin puede insertar usuarios de su tenant
DROP POLICY IF EXISTS "dashboard_users_admin_insert" ON public.dashboard_users;
CREATE POLICY "dashboard_users_admin_insert"
  ON public.dashboard_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.tenant_id()
    AND public.user_role() = 'admin'
  );

-- 5. Policy: admin puede actualizar is_active de usuarios de su tenant
DROP POLICY IF EXISTS "dashboard_users_admin_update" ON public.dashboard_users;
CREATE POLICY "dashboard_users_admin_update"
  ON public.dashboard_users
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.tenant_id()
    AND public.user_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = public.tenant_id()
  );

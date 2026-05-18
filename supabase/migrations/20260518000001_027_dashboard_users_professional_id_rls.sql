-- Migration: dashboard_users professional_id + RLS para receptionist y doctor
-- Story 10.3 — Migración DB: professional_id en dashboard_users y RLS para receptionist/doctor
-- 2026-05-18
--
-- ORDEN DE OPERACIONES (crítico):
-- 1. ALTER TABLE dashboard_users ADD COLUMN professional_id
-- 2. CREATE FUNCTION current_professional_id()
-- 3. Drop policies SELECT genéricas de professional_schedules y blocked_times
-- 4. Create nuevas policies SELECT separadas por rol
-- 5. Policies INSERT/UPDATE/DELETE para receptionist en las tres tablas
-- 6. Policies UPDATE para doctor en professional_schedules y blocked_times

-- ── Parte 1: Columna professional_id en dashboard_users ──────────────────────

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS professional_id UUID
    REFERENCES public.professionals(professional_id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.dashboard_users.professional_id
  IS 'Solo aplica a usuarios con role=''doctor''. Para admin y receptionist queda NULL. Vincula el usuario de auth con su fila en professionals.';

CREATE INDEX IF NOT EXISTS idx_dashboard_users_professional_id
  ON public.dashboard_users(professional_id)
  WHERE professional_id IS NOT NULL;

-- ── Parte 2: Helper function para obtener professional_id del usuario actual ──

CREATE OR REPLACE FUNCTION public.current_professional_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT professional_id
  FROM public.dashboard_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ── Parte 3: RLS receptionist en professionals ────────────────────────────────
-- La policy SELECT para receptionist ya está cubierta por professionals_select_own
-- (cualquier usuario autenticado del tenant puede hacer SELECT).

DROP POLICY IF EXISTS professionals_insert_receptionist ON public.professionals;
CREATE POLICY professionals_insert_receptionist
  ON public.professionals FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

DROP POLICY IF EXISTS professionals_update_receptionist ON public.professionals;
CREATE POLICY professionals_update_receptionist
  ON public.professionals FOR UPDATE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

DROP POLICY IF EXISTS professionals_delete_receptionist ON public.professionals;
CREATE POLICY professionals_delete_receptionist
  ON public.professionals FOR DELETE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- ── Parte 4: Reemplazar policy SELECT genérica de professional_schedules ──────
-- CRÍTICO: La policy genérica (todos los usuarios del tenant) debe eliminarse y
-- reemplazarse con dos policies: una para admin/receptionist y otra para doctor.
-- En Postgres, múltiples policies permisivas se combinan con OR, por lo que si
-- existe la genérica + la restrictiva del doctor, el doctor vería TODOS los horarios.

DROP POLICY IF EXISTS professional_schedules_select_own ON public.professional_schedules;

-- admin y receptionist: ven todos los horarios del tenant
DROP POLICY IF EXISTS professional_schedules_select_admin_receptionist ON public.professional_schedules;
CREATE POLICY professional_schedules_select_admin_receptionist
  ON public.professional_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' IN ('admin', 'receptionist')
  );

-- doctor: SELECT solo sus propios horarios
DROP POLICY IF EXISTS professional_schedules_select_doctor_own ON public.professional_schedules;
CREATE POLICY professional_schedules_select_doctor_own
  ON public.professional_schedules FOR SELECT TO authenticated
  USING (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND professional_schedules.professional_id = public.current_professional_id()
  );

-- receptionist: INSERT en professional_schedules
DROP POLICY IF EXISTS professional_schedules_insert_receptionist ON public.professional_schedules;
CREATE POLICY professional_schedules_insert_receptionist
  ON public.professional_schedules FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- receptionist: UPDATE en professional_schedules
DROP POLICY IF EXISTS professional_schedules_update_receptionist ON public.professional_schedules;
CREATE POLICY professional_schedules_update_receptionist
  ON public.professional_schedules FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- receptionist: DELETE en professional_schedules
DROP POLICY IF EXISTS professional_schedules_delete_receptionist ON public.professional_schedules;
CREATE POLICY professional_schedules_delete_receptionist
  ON public.professional_schedules FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- doctor: UPDATE solo sus propios horarios
DROP POLICY IF EXISTS professional_schedules_update_doctor_own ON public.professional_schedules;
CREATE POLICY professional_schedules_update_doctor_own
  ON public.professional_schedules FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND professional_schedules.professional_id = public.current_professional_id()
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND professional_schedules.professional_id = public.current_professional_id()
  );

-- ── Parte 5: Reemplazar policy SELECT genérica de blocked_times ───────────────
-- Misma lógica que professional_schedules: eliminar genérica, crear dos separadas.

DROP POLICY IF EXISTS blocked_times_select_own ON public.blocked_times;

-- admin y receptionist: ven todos los bloqueos del tenant
DROP POLICY IF EXISTS blocked_times_select_admin_receptionist ON public.blocked_times;
CREATE POLICY blocked_times_select_admin_receptionist
  ON public.blocked_times FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' IN ('admin', 'receptionist')
  );

-- doctor: SELECT solo sus propios bloqueos
DROP POLICY IF EXISTS blocked_times_select_doctor_own ON public.blocked_times;
CREATE POLICY blocked_times_select_doctor_own
  ON public.blocked_times FOR SELECT TO authenticated
  USING (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND blocked_times.professional_id = public.current_professional_id()
  );

-- receptionist: INSERT en blocked_times
DROP POLICY IF EXISTS blocked_times_insert_receptionist ON public.blocked_times;
CREATE POLICY blocked_times_insert_receptionist
  ON public.blocked_times FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- receptionist: UPDATE en blocked_times
DROP POLICY IF EXISTS blocked_times_update_receptionist ON public.blocked_times;
CREATE POLICY blocked_times_update_receptionist
  ON public.blocked_times FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- receptionist: DELETE en blocked_times
DROP POLICY IF EXISTS blocked_times_delete_receptionist ON public.blocked_times;
CREATE POLICY blocked_times_delete_receptionist
  ON public.blocked_times FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'app_role' = 'receptionist'
  );

-- doctor: UPDATE solo sus propios bloqueos
DROP POLICY IF EXISTS blocked_times_update_doctor_own ON public.blocked_times;
CREATE POLICY blocked_times_update_doctor_own
  ON public.blocked_times FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND blocked_times.professional_id = public.current_professional_id()
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND blocked_times.professional_id = public.current_professional_id()
  );

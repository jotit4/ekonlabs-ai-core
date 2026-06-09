-- Migration: professionals — RLS UPDATE para que el doctor edite SOLO su propia fila
-- Story 10.8 — Mi Perfil (autoservicio de datos del staff)

-- doctor: UPDATE solo su propia fila en professionals
-- Mismo patrón que professional_schedules_update_doctor_own (migración 027).
-- current_professional_id() es SECURITY DEFINER y ya existe (migración 027).
-- NOTA: coexiste con professionals_update_receptionist (027) — policies permisivas
-- se combinan con OR; cada una habilita un rol distinto. NO eliminar la del receptionist.
DROP POLICY IF EXISTS professionals_update_doctor_own ON public.professionals;
CREATE POLICY professionals_update_doctor_own
  ON public.professionals FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND professional_id = public.current_professional_id()
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'doctor'
    AND professional_id = public.current_professional_id()
  );

-- dashboard_users — RLS UPDATE para que cualquier usuario edite SOLO su propia fila
-- VERIFICADO (2026-06-05): la migración base (20260506224816_dashboard_users.sql) solo
-- definió la policy de SELECT (dashboard_users_own_record). La 20260508_004 agregó
-- dashboard_users_admin_update (admin-only). NO existe policy de UPDATE para el propio
-- registro de un usuario no-admin. Es necesaria para que doctor/receptionist puedan
-- actualizar su full_name vía PATCH /api/me/profile.
-- La superficie es segura a nivel API: el PATCH solo envía { full_name }; el usuario
-- nunca puede cambiar role/tenant_id/professional_id desde esa ruta.
DROP POLICY IF EXISTS dashboard_users_update_own ON public.dashboard_users;
CREATE POLICY dashboard_users_update_own
  ON public.dashboard_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

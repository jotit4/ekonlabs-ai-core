-- Migration: professional_schedules — policies de escritura (INSERT/UPDATE/DELETE)
-- Story 9.2 — RLS para Tablas del Calendario Nativo
-- 2026-05-16
--
-- NOTA: La policy SELECT (professional_schedules_select_own) ya fue creada en Story 9.1
-- (migration 20260516000003_016_professional_schedules.sql). Esta migration solo agrega
-- las policies de escritura.
--
-- professional_schedules no tiene tenant_id directo. Se valida tenant via JOIN a professionals.
-- Escritura permitida para: admin del tenant O el propio profesional (email match).

-- ── Tabla professional_schedules — Policies de escritura ─────────────────────

-- INSERT: admin del tenant O el profesional dueño del horario
DROP POLICY IF EXISTS professional_schedules_insert_own_or_admin ON public.professional_schedules;
CREATE POLICY professional_schedules_insert_own_or_admin
  ON public.professional_schedules FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

-- UPDATE: admin del tenant O el profesional dueño del horario
DROP POLICY IF EXISTS professional_schedules_update_own_or_admin ON public.professional_schedules;
CREATE POLICY professional_schedules_update_own_or_admin
  ON public.professional_schedules FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

-- DELETE: admin del tenant O el profesional dueño del horario
DROP POLICY IF EXISTS professional_schedules_delete_own_or_admin ON public.professional_schedules;
CREATE POLICY professional_schedules_delete_own_or_admin
  ON public.professional_schedules FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = professional_schedules.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

-- Migration: service_professionals — policies de escritura (INSERT/DELETE)
-- Story 9.2 — RLS para Tablas del Calendario Nativo
-- 2026-05-16
--
-- NOTA: La policy SELECT (service_professionals_select_own) ya fue creada en Story 9.1
-- (migration 20260516000002_015_service_professionals.sql). Esta migration solo agrega
-- las policies de escritura.
--
-- service_professionals no tiene tenant_id directo. Se valida tenant via JOIN a professionals.
-- No se agrega UPDATE ya que la asignación servicio-profesional se gestiona
-- borrando + insertando (no hay UPDATE semántico en este MVP).

-- ── Tabla service_professionals — Policies de escritura ──────────────────────

-- INSERT: solo admin del mismo tenant (validación via JOIN a professionals)
DROP POLICY IF EXISTS service_professionals_insert_admin ON public.service_professionals;
CREATE POLICY service_professionals_insert_admin
  ON public.service_professionals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'role' = 'admin'
  );

-- UPDATE: solo admin del mismo tenant (validación via JOIN a professionals)
DROP POLICY IF EXISTS service_professionals_update_admin ON public.service_professionals;
CREATE POLICY service_professionals_update_admin
  ON public.service_professionals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'role' = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'role' = 'admin'
  );

-- DELETE: solo admin del mismo tenant (validación via JOIN a professionals)
DROP POLICY IF EXISTS service_professionals_delete_admin ON public.service_professionals;
CREATE POLICY service_professionals_delete_admin
  ON public.service_professionals FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = service_professionals.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    )
    AND auth.jwt() ->> 'role' = 'admin'
  );

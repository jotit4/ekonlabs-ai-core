-- Migration: professionals — policies de escritura (INSERT/UPDATE/DELETE)
-- Story 9.2 — RLS para Tablas del Calendario Nativo
-- 2026-05-16
--
-- NOTA: La policy SELECT (professionals_select_own) ya fue creada en Story 9.1
-- (migration 20260516000001_014_professionals.sql). Esta migration solo agrega
-- las policies de escritura. NO recrear la policy SELECT.

-- ── Tabla professionals — Policies de escritura ───────────────────────────────

-- INSERT: solo admin del mismo tenant
DROP POLICY IF EXISTS professionals_insert_admin ON public.professionals;
CREATE POLICY professionals_insert_admin
  ON public.professionals FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'role' = 'admin'
  );

-- UPDATE: solo admin del mismo tenant
DROP POLICY IF EXISTS professionals_update_admin ON public.professionals;
CREATE POLICY professionals_update_admin
  ON public.professionals FOR UPDATE TO authenticated
  USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'role' = 'admin'
  );

-- DELETE: solo admin del mismo tenant
DROP POLICY IF EXISTS professionals_delete_admin ON public.professionals;
CREATE POLICY professionals_delete_admin
  ON public.professionals FOR DELETE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND auth.jwt() ->> 'role' = 'admin'
  );

-- Migration: blocked_times — policies de escritura (INSERT/UPDATE/DELETE)
-- Story 9.2 — RLS para Tablas del Calendario Nativo
-- 2026-05-16
--
-- NOTA: La policy SELECT (blocked_times_select_own) ya fue creada en Story 9.1
-- (migration 20260516000004_017_blocked_times.sql). Esta migration solo agrega
-- las policies de escritura.
--
-- blocked_times no tiene tenant_id directo. Se valida tenant via JOIN a professionals.
-- Escritura permitida para: admin del tenant O el propio profesional (email match).

-- ── Tabla blocked_times — Policies de escritura ───────────────────────────────

-- INSERT: admin del tenant O el profesional dueño del bloqueo
DROP POLICY IF EXISTS blocked_times_insert_own_or_admin ON public.blocked_times;
CREATE POLICY blocked_times_insert_own_or_admin
  ON public.blocked_times FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

-- UPDATE: admin del tenant O el profesional dueño del bloqueo
DROP POLICY IF EXISTS blocked_times_update_own_or_admin ON public.blocked_times;
CREATE POLICY blocked_times_update_own_or_admin
  ON public.blocked_times FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
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
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

-- DELETE: admin del tenant O el profesional dueño del bloqueo
DROP POLICY IF EXISTS blocked_times_delete_own_or_admin ON public.blocked_times;
CREATE POLICY blocked_times_delete_own_or_admin
  ON public.blocked_times FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.professional_id = blocked_times.professional_id
        AND p.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
        AND (
          auth.jwt() ->> 'role' = 'admin'
          OR p.email = coalesce(auth.jwt() ->> 'email', auth.email())
        )
    )
  );

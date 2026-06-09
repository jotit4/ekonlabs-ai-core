-- Migración 030 — Cerrar fuga multi-tenant: RLS en patient_consents y appointment_counters
--
-- CONTEXTO (auditoría 2026-05-29):
--   El advisor de seguridad de Supabase reporta 2 tablas en `public` SIN RLS,
--   expuestas a los roles `anon` y `authenticated`: cualquiera con la anon key
--   podía leer/escribir TODAS las filas de TODOS los tenants.
--     - public.patient_consents     (consentimientos opt-in, Ley 25.326 — PII sensible)
--     - public.appointment_counters (contador interno por tenant para short_id de turnos)
--
-- POR QUÉ ES SEGURO ACTIVAR RLS (verificado):
--   - El AGENTE accede vía service_role y vía RPCs SECURITY DEFINER
--     (generate_appointment_id, get_or_create_patient): ambos BYPASSEAN RLS.
--   - Ningún código de rol `authenticated` (dashboard) lee/escribe estas tablas hoy.
--   => Habilitar RLS no rompe el agente ni el dashboard.
--
-- DISEÑO DE POLÍTICAS (espeja el patrón existente del repo):
--   - patient_consents: SELECT solo para admins del propio tenant (igual que audit_logs,
--     por ser dato de compliance). Sin políticas de escritura para `authenticated`:
--     los writes siguen ocurriendo solo por service_role / SECURITY DEFINER.
--   - appointment_counters: sin políticas para `authenticated`. RLS habilitado + cero
--     políticas = bloqueo total para anon/authenticated; service_role/definer siguen OK.
--     (El dashboard nunca consulta esta tabla.)

BEGIN;

-- ============================================================================
-- 1) patient_consents  (PII sensible)
-- ============================================================================
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

-- Lectura: solo admins, solo de su propio tenant (mismo criterio que audit_logs).
DROP POLICY IF EXISTS patient_consents_select_admin ON public.patient_consents;
CREATE POLICY patient_consents_select_admin
  ON public.patient_consents
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.tenant_id()
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

-- Sin políticas de INSERT/UPDATE/DELETE para `authenticated`:
-- el registro/revocación de consentimientos se hace exclusivamente desde el backend
-- (service_role / RPC SECURITY DEFINER), que no está sujeto a RLS.

-- ============================================================================
-- 2) appointment_counters  (contador interno, sin PII)
-- ============================================================================
ALTER TABLE public.appointment_counters ENABLE ROW LEVEL SECURITY;

-- Intencionalmente SIN políticas: nadie con rol anon/authenticated debe tocar
-- esta tabla. Solo service_role y generate_appointment_id() (SECURITY DEFINER)
-- la modifican, y esos bypassан RLS.

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (ejecutar por separado tras aplicar)
-- ============================================================================
-- Esperado: ambas con rls_enabled = true.
--   patient_consents      -> 1 política (patient_consents_select_admin)
--   appointment_counters  -> 0 políticas
--
-- SELECT c.relname AS tabla,
--        c.relrowsecurity AS rls_enabled,
--        (SELECT count(*) FROM pg_policies p
--           WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public'
--   AND c.relname IN ('patient_consents','appointment_counters');

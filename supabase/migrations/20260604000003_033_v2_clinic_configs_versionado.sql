-- Migración 033 — Versionado de public.v2_clinic_configs (tabla canónica de config del agente)
--
-- CONTEXTO (Story 6.6 — Fase 1 plan-config-entrenamiento-agente-isadi):
--   La "Configuración del Agente" del dashboard estaba DESCONECTADA del agente:
--   escribía a tenants.system_prompt_override / tenants.rules, columnas que el
--   backend (ekonlabs-agent) NUNCA lee. El agente lee su config de
--   `public.v2_clinic_configs` (config_service.py → prompt_builder.build_system_prompt).
--   Esta migración VERSIONA el schema de esa tabla para evitar drift y dejar el
--   contrato explícito en el repo.
--
-- ⚠️  LA TABLA YA EXISTE EN PROD. Esta migración es IDEMPOTENTE y re-ejecutable:
--     - CREATE TABLE IF NOT EXISTS    → no recrea ni borra datos existentes.
--     - ALTER TABLE ... ENABLE RLS    → seguro sobre tabla con RLS ya activo.
--     - Policies con DROP IF EXISTS + CREATE (Postgres NO soporta CREATE POLICY IF NOT EXISTS).
--   NO aplicar desde el repo: el deploy lo hace el usuario manualmente en su entorno
--   (sin Supabase MCP). Solo se versiona el archivo.
--
-- SCHEMA (fuente: supabase/seeds/onboard_tenant.sql):
--   org_id            uuid  PK/UNIQUE (= tenants.tenant_id) — habilita ON CONFLICT (org_id) del seed
--   clinic_name       text
--   agent_name        text
--   ia_config         jsonb  -- { tone_base, tone_length, identity, constraints, features{...} }
--   operations_config jsonb  -- { min_notice_hours, future_window_days }
--   prompt_rules      text   -- inyectado por el agente como "## Reglas de la Clínica"
--   chatwoot_config   jsonb  -- (fuera de scope de la 6.6)
--   alert_rules       jsonb  -- (fuera de scope de la 6.6)
--
-- RLS: el dashboard escribe con el cliente AUTENTICADO normal (no admin/service_role).
--   La policy clinic_configs_tenant_write (org_id = public.tenant_id()) lo permite.
--   public.tenant_id() = NULLIF(auth.jwt() ->> 'tenant_id','')::uuid
--   (def. en 20260506224817_custom_token_hook.sql).
--
-- NOTA sobre nombres de policy en prod:
--   El plan fija los nombres clinic_configs_tenant_read / clinic_configs_tenant_write.
--   Si en prod existieran policies con OTRO nombre, este DROP IF EXISTS no las elimina
--   (no falla, pero podrían quedar duplicadas). Verificar nombres reales antes del deploy.

BEGIN;

-- ============================================================================
-- 1) Tabla (no recrea si ya existe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.v2_clinic_configs (
  org_id            uuid PRIMARY KEY REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  clinic_name       text,
  agent_name        text,
  ia_config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  operations_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_rules      text  NOT NULL DEFAULT '',
  chatwoot_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_rules       jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- ============================================================================
-- 2) RLS (idempotente — re-ejecutable sobre tabla con RLS ya activo)
-- ============================================================================
ALTER TABLE public.v2_clinic_configs ENABLE ROW LEVEL SECURITY;

-- Lectura: cada tenant ve solo su propia fila.
DROP POLICY IF EXISTS clinic_configs_tenant_read ON public.v2_clinic_configs;
CREATE POLICY clinic_configs_tenant_read
  ON public.v2_clinic_configs
  FOR SELECT
  TO authenticated
  USING (org_id = public.tenant_id());

-- Escritura: cada tenant escribe solo su propia fila (USING + WITH CHECK).
-- El gate por ROL (admin/receptionist) vive en el endpoint /api/agente/config,
-- no en la RLS (la RLS es por tenant, no por rol).
DROP POLICY IF EXISTS clinic_configs_tenant_write ON public.v2_clinic_configs;
CREATE POLICY clinic_configs_tenant_write
  ON public.v2_clinic_configs
  FOR ALL
  TO authenticated
  USING (org_id = public.tenant_id())
  WITH CHECK (org_id = public.tenant_id());

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (ejecutar por separado tras aplicar)
-- ============================================================================
-- Esperado: rls_enabled = true y 2 políticas
--   (clinic_configs_tenant_read, clinic_configs_tenant_write).
--
-- SELECT c.relname AS tabla,
--        c.relrowsecurity AS rls_enabled,
--        (SELECT count(*) FROM pg_policies p
--           WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public' AND c.relname = 'v2_clinic_configs';

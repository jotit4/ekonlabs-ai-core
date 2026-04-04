-- =============================================================================
-- Bootstrap Core v1 — Proyecto zgknmifmeoacravtskbx
-- =============================================================================
-- Migración consolidada de arranque para proyecto Supabase nuevo y vacío.
-- Reemplaza la secuencia histórica de migraciones individuales:
--   001_initial_schema.sql
--   002_conversations_table.sql
--   002_knowledge_chunks.sql
--   002_calendar_columns.sql
--   003_tenant_system_rules.sql
-- Fuera del alcance v1: tabla appointments, purge job, Vault para credentials.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- EXTENSIONES
-- ---------------------------------------------------------------------------

-- pgcrypto: gen_random_uuid() — puede ya estar instalada en extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- vector: pgvector para knowledge_chunks embeddings (1536 dims / OpenAI)
CREATE EXTENSION IF NOT EXISTS vector;


-- ---------------------------------------------------------------------------
-- FUNCIÓN TRIGGER: updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- TABLA: tenants
-- ---------------------------------------------------------------------------
-- Contrato: ekonlabs-ai-core/app/models/tenant.py → TenantConfig
-- Todas las columnas en CREATE TABLE para evitar ALTER posteriores en
-- proyectos nuevos. Las columnas calendar_* son nullable (tenants sin
-- calendario siguen operando con RAG normal).

CREATE TABLE IF NOT EXISTS public.tenants (
    tenant_id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text        NOT NULL CHECK (char_length(trim(name)) >= 2),
    whatsapp_number         text        NOT NULL UNIQUE CHECK (whatsapp_number ~ '^\+?[0-9]{8,20}$'),
    timezone                text        NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    shadow_mode_enabled     boolean     NOT NULL DEFAULT false,
    status                  text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    -- Story 1.4: configuración de comportamiento del agente
    system_prompt_override  text        DEFAULT NULL,
    rules                   jsonb       NOT NULL DEFAULT '{}',
    -- Story 3.1: integración Google Calendar (nullable, opcional por tenant)
    calendar_id             text        DEFAULT NULL,
    calendar_credentials    jsonb       DEFAULT NULL,
    -- Timestamps
    created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Índices tenants
CREATE INDEX IF NOT EXISTS idx_tenants_status
    ON public.tenants (status);

CREATE INDEX IF NOT EXISTS idx_tenants_created_at
    ON public.tenants (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenants_rules
    ON public.tenants USING gin (rules);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- RLS tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_own ON public.tenants;
CREATE POLICY tenants_select_own
ON public.tenants FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS tenants_update_own ON public.tenants;
CREATE POLICY tenants_update_own
ON public.tenants FOR UPDATE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS tenants_delete_own ON public.tenants;
CREATE POLICY tenants_delete_own
ON public.tenants FOR DELETE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- INSERT sólo vía service_role (backend bypasa RLS); clientes authenticated bloqueados
DROP POLICY IF EXISTS tenants_insert_service_role_only ON public.tenants;
CREATE POLICY tenants_insert_service_role_only
ON public.tenants FOR INSERT TO authenticated
WITH CHECK (false);

REVOKE ALL ON TABLE public.tenants FROM anon;


-- ---------------------------------------------------------------------------
-- TABLA: conversations
-- ---------------------------------------------------------------------------
-- NFR4 (Ley 25.326): registros deben purgarse a 30 días — deuda operativa,
-- pendiente implementación de job programado.

CREATE TABLE IF NOT EXISTS public.conversations (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    phone_number    text        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
    role            text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         text        NOT NULL CHECK (char_length(trim(content)) >= 1),
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.conversations IS
'Historial de mensajes por paciente/tenant. Purgar registros > 30 días (NFR4 / Ley Argentina 25.326).';

-- Índice compuesto para queries de historial ordenado por tiempo
-- Soporta: .eq("tenant_id").eq("phone_number").order("created_at", desc).limit(n)
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_phone_time
    ON public.conversations (tenant_id, phone_number, created_at DESC);

-- RLS conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_own ON public.conversations;
CREATE POLICY conversations_select_own
ON public.conversations FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS conversations_insert_service_role_only ON public.conversations;
CREATE POLICY conversations_insert_service_role_only
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS conversations_update_own ON public.conversations;
CREATE POLICY conversations_update_own
ON public.conversations FOR UPDATE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS conversations_delete_own ON public.conversations;
CREATE POLICY conversations_delete_own
ON public.conversations FOR DELETE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

REVOKE ALL ON TABLE public.conversations FROM anon;


-- ---------------------------------------------------------------------------
-- TABLA: knowledge_chunks
-- ---------------------------------------------------------------------------
-- Requiere extensión vector instalada (ver arriba).
-- Embeddings de 1536 dimensiones (text-embedding-ada-002 / OpenAI).
-- IVFFlat con lists=100 apto para hasta ~1M vectores.

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    content         text        NOT NULL,
    embedding       vector(1536) NOT NULL,
    source_filename text        NOT NULL,
    chunk_index     int         NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Índice de filtrado por tenant (presente en todos los WHERE)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id
    ON public.knowledge_chunks (tenant_id);

-- IVFFlat para búsqueda por similitud coseno (<=> operator)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON public.knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- RLS knowledge_chunks
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_chunks_select_own ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_select_own
ON public.knowledge_chunks FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS knowledge_chunks_insert_service_role_only ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_insert_service_role_only
ON public.knowledge_chunks FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS knowledge_chunks_update_service_role_only ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_update_service_role_only
ON public.knowledge_chunks FOR UPDATE TO authenticated
USING (false);

DROP POLICY IF EXISTS knowledge_chunks_delete_service_role_only ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_delete_service_role_only
ON public.knowledge_chunks FOR DELETE TO authenticated
USING (false);

REVOKE ALL ON TABLE public.knowledge_chunks FROM anon;

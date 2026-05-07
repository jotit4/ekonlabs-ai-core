-- =============================================================================
-- Bootstrap Core v1 — Proyecto zgknmifmeoacravtskbx
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONES
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
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

CREATE TABLE IF NOT EXISTS public.tenants (
    tenant_id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text        NOT NULL CHECK (char_length(trim(name)) >= 2),
    whatsapp_number         text        NOT NULL UNIQUE CHECK (whatsapp_number ~ '^\+?[0-9]{8,20}$'),
    timezone                text        NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    shadow_mode_enabled     boolean     NOT NULL DEFAULT false,
    status                  text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    system_prompt_override  text        DEFAULT NULL,
    rules                   jsonb       NOT NULL DEFAULT '{}',
    calendar_id             text        DEFAULT NULL,
    calendar_credentials    jsonb       DEFAULT NULL,
    created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_tenants_status
    ON public.tenants (status);

CREATE INDEX IF NOT EXISTS idx_tenants_created_at
    ON public.tenants (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenants_rules
    ON public.tenants USING gin (rules);

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

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

DROP POLICY IF EXISTS tenants_insert_service_role_only ON public.tenants;
CREATE POLICY tenants_insert_service_role_only
ON public.tenants FOR INSERT TO authenticated
WITH CHECK (false);

REVOKE ALL ON TABLE public.tenants FROM anon;


-- ---------------------------------------------------------------------------
-- TABLA: conversations
-- ---------------------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_phone_time
    ON public.conversations (tenant_id, phone_number, created_at DESC);

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

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    content         text        NOT NULL,
    embedding       vector(1536) NOT NULL,
    source_filename text        NOT NULL,
    chunk_index     int         NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id
    ON public.knowledge_chunks (tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON public.knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

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

REVOKE ALL ON TABLE public.knowledge_chunks FROM anon;;

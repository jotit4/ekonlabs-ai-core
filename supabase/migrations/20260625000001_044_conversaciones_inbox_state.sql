-- Migration 044: Estado de bandeja PROPIO del dashboard para Conversaciones IA
-- (paridad Chatwoot: no-leídos, resolver/reabrir, notas privadas).
--
-- POR QUÉ TABLAS NUEVAS Y NO COLUMNAS EN thread_states:
-- `thread_states` tiene RLS de escritura = service_role ONLY (INSERT/UPDATE/DELETE
-- para `authenticated` con WITH CHECK/USING false). Solo el agente (LangGraph) la
-- escribe. El dashboard (usuario autenticado) NO puede escribirla. Estas tres
-- features son estado PROPIO del dashboard (las marca el operador, el agente las
-- ignora), así que viven en tablas nuevas con RLS de escritura autenticada por tenant.
--
-- Puramente ADITIVA: CREATE TABLE IF NOT EXISTS + policies nuevas. No toca nada
-- existente. auth.uid() = id del usuario autenticado (claim `sub` del JWT Supabase,
-- siempre presente aunque el JWT lleve claims custom tenant_id/app_role).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conversation_reads — marca de "última lectura" POR USUARIO (no-leídos)
--    is_unread se deriva en /api/conversations: último mensaje entrante (role='user')
--    con created_at > last_read_at del usuario actual ⇒ no leído.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_reads (
    tenant_id    uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL,
    phone_number text        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
    last_read_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (tenant_id, user_id, phone_number)
);

COMMENT ON TABLE public.conversation_reads IS
'Marca de última lectura por (tenant, usuario, conversación) para derivar no-leídos '
'en la Bandeja IA. La escribe el dashboard cuando el operador abre la conversación.';

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_reads_select_own ON public.conversation_reads;
CREATE POLICY conversation_reads_select_own
ON public.conversation_reads FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND user_id = auth.uid());

DROP POLICY IF EXISTS conversation_reads_insert_own ON public.conversation_reads;
CREATE POLICY conversation_reads_insert_own
ON public.conversation_reads FOR INSERT TO authenticated
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND user_id = auth.uid());

DROP POLICY IF EXISTS conversation_reads_update_own ON public.conversation_reads;
CREATE POLICY conversation_reads_update_own
ON public.conversation_reads FOR UPDATE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND user_id = auth.uid())
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND user_id = auth.uid());

REVOKE ALL ON TABLE public.conversation_reads FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. conversation_resolutions — resolver/reabrir POR CONVERSACIÓN (compartido)
--    resolved_at NULL = abierta. La conversación se considera "resuelta" solo si
--    resolved_at IS NOT NULL y NO llegó un mensaje nuevo después (auto-reabrir:
--    last_created_at > resolved_at ⇒ vuelve a abierta, sin trigger).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_resolutions (
    tenant_id        uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    phone_number     text        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
    resolved_at      timestamptz DEFAULT NULL,
    resolved_by_user uuid        DEFAULT NULL,
    resolved_by_name text        DEFAULT NULL,
    updated_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (tenant_id, phone_number)
);

COMMENT ON TABLE public.conversation_resolutions IS
'Estado resuelto/reabierto por conversación (compartido en el tenant) para la '
'Bandeja IA. Concepto SOLO del dashboard; el agente lo ignora. Auto-reabre cuando '
'llega un mensaje con created_at > resolved_at.';

ALTER TABLE public.conversation_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_resolutions_select ON public.conversation_resolutions;
CREATE POLICY conversation_resolutions_select
ON public.conversation_resolutions FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS conversation_resolutions_insert ON public.conversation_resolutions;
CREATE POLICY conversation_resolutions_insert
ON public.conversation_resolutions FOR INSERT TO authenticated
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS conversation_resolutions_update ON public.conversation_resolutions;
CREATE POLICY conversation_resolutions_update
ON public.conversation_resolutions FOR UPDATE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

REVOKE ALL ON TABLE public.conversation_resolutions FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. conversation_notes — notas privadas internas POR CONVERSACIÓN (compartidas)
--    Nunca se envían al paciente. Visibles para todo el staff del tenant; borrado
--    solo por el autor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_notes (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    phone_number text        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
    author_user  uuid        NOT NULL,
    author_name  text        DEFAULT NULL,
    body         text        NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS conversation_notes_tenant_phone_idx
ON public.conversation_notes (tenant_id, phone_number, created_at DESC);

COMMENT ON TABLE public.conversation_notes IS
'Notas privadas internas por conversación (Bandeja IA). Nunca se envían al paciente. '
'Visibles para todo el staff del tenant; borrado solo por el autor.';

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_notes_select ON public.conversation_notes;
CREATE POLICY conversation_notes_select
ON public.conversation_notes FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS conversation_notes_insert_own ON public.conversation_notes;
CREATE POLICY conversation_notes_insert_own
ON public.conversation_notes FOR INSERT TO authenticated
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND author_user = auth.uid());

DROP POLICY IF EXISTS conversation_notes_delete_own ON public.conversation_notes;
CREATE POLICY conversation_notes_delete_own
ON public.conversation_notes FOR DELETE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND author_user = auth.uid());

REVOKE ALL ON TABLE public.conversation_notes FROM anon;

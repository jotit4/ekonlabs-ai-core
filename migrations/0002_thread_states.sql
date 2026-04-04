-- =============================================================================
-- Migration 0002 — Thread States
-- Story 3.4: Evaluación Continua del Confidence Score
-- =============================================================================
-- Introduce la tabla `thread_states` para persistir el estado de pausa por hilo
-- conversacional. Un hilo = binomio (tenant_id, phone_number).
--
-- Usada por:
--   - Story 3.4: paused por low_confidence (generation_node + worker)
--   - Story 4.1 (futura): paused por human_takeover (webhook outgoing)
--   - Story 4.2 (futura): reactivación del hilo (slash command /resume)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TABLA: thread_states
-- ---------------------------------------------------------------------------
-- PK compuesto (tenant_id, phone_number) — un registro por hilo conversacional.
-- UPSERT es la única operación de escritura permitida (INSERT ... ON CONFLICT UPDATE).

CREATE TABLE IF NOT EXISTS public.thread_states (
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    phone_number    text        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
    status          text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused')),
    paused_reason   text        DEFAULT NULL,   -- 'low_confidence' | 'human_takeover'
    paused_at       timestamptz DEFAULT NULL,   -- NULL cuando status='active'
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (tenant_id, phone_number)
);

COMMENT ON TABLE public.thread_states IS
'Estado de pausa por hilo conversacional (tenant_id + phone_number). '
'Persistido por worker RQ al detectar is_paused=True en el estado LangGraph.';

COMMENT ON COLUMN public.thread_states.paused_reason IS
'Razón de la pausa: low_confidence (Story 3.4) o human_takeover (Story 4.1 futura).';

-- Trigger updated_at — reutiliza la función definida en 0001_bootstrap_core.sql
DROP TRIGGER IF EXISTS trg_thread_states_updated_at ON public.thread_states;
CREATE TRIGGER trg_thread_states_updated_at
BEFORE UPDATE ON public.thread_states
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();


-- ---------------------------------------------------------------------------
-- RLS: thread_states
-- ---------------------------------------------------------------------------

ALTER TABLE public.thread_states ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant autenticado puede leer sus propios hilos
DROP POLICY IF EXISTS thread_states_select_own ON public.thread_states;
CREATE POLICY thread_states_select_own
ON public.thread_states FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- INSERT/UPDATE: solo service_role (backend con SUPABASE_KEY bypasa RLS)
-- Los clientes authenticated no pueden escribir directamente.
DROP POLICY IF EXISTS thread_states_insert_service_role_only ON public.thread_states;
CREATE POLICY thread_states_insert_service_role_only
ON public.thread_states FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS thread_states_update_service_role_only ON public.thread_states;
CREATE POLICY thread_states_update_service_role_only
ON public.thread_states FOR UPDATE TO authenticated
USING (false);

-- DELETE: solo service_role (no disponible para authenticated)
DROP POLICY IF EXISTS thread_states_delete_service_role_only ON public.thread_states;
CREATE POLICY thread_states_delete_service_role_only
ON public.thread_states FOR DELETE TO authenticated
USING (false);

REVOKE ALL ON TABLE public.thread_states FROM anon;

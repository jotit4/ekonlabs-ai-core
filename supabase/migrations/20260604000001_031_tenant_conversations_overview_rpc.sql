-- Migration: RPC para derivar la bandeja de Conversaciones desde `conversations`
-- Story 4.8 (Bandeja Espejo): la bandeja debe mostrar TODA conversación con
-- mensajes en `conversations`, tenga o no fila en `thread_states`.
--
-- Antes, GET /api/conversations usaba `thread_states` como índice maestro y
-- ocultaba conversaciones huérfanas (mensajes en `conversations` sin thread_state,
-- por fallo transitorio del upsert fire-and-forget del backend ekonlabs-agent).
--
-- Esta RPC deriva la lista desde `conversations` (DISTINCT ON por phone_number,
-- último mensaje) y hace LEFT JOIN a `thread_states` solo para traer el estado del
-- agente (NULL si no existe). Mismo patrón canónico que get_latest_messages_by_phone:
-- SECURITY DEFINER + filtro por auth.jwt() ->> 'tenant_id' (frontera de aislamiento;
-- el caller NO puede inyectar otro tenant porque no hay parámetro tenant_id).

CREATE OR REPLACE FUNCTION public.get_tenant_conversations_overview()
RETURNS TABLE (
  phone_number     text,
  last_content     text,
  last_role        text,
  last_created_at  timestamptz,
  ts_status        text,
  ts_paused_reason text,
  ts_updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (c.phone_number)
    c.phone_number,
    c.content        AS last_content,
    c.role           AS last_role,
    c.created_at     AS last_created_at,
    ts.status        AS ts_status,
    ts.paused_reason AS ts_paused_reason,
    ts.updated_at    AS ts_updated_at
  FROM public.conversations c
  LEFT JOIN public.thread_states ts
    ON ts.tenant_id = c.tenant_id
   AND ts.phone_number = c.phone_number
  WHERE c.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
  ORDER BY c.phone_number, c.created_at DESC;
$$;

-- Solo usuarios autenticados pueden llamar la RPC (filtro por tenant_id en WHERE)
GRANT EXECUTE ON FUNCTION public.get_tenant_conversations_overview() TO authenticated;

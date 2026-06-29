-- Migration 046: Fix cast en get_tenant_conversations_overview
-- Definida originalmente en 20260604000001_031_tenant_conversations_overview_rpc.sql
--
-- PROBLEMA: el WHERE usaba `c.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')`
-- El cast ::text sobre la COLUMNA impide que el planificador use el índice
-- idx_conversations_tenant_phone_time → full sequential scan en tablas grandes.
--
-- FIX: invertir el cast al lado del LITERAL:
--   c.tenant_id = coalesce(auth.jwt() ->> 'tenant_id', '')::uuid
-- Ahora la columna queda sin cast → el índice parcial puede usarse.
--
-- El resto de la función es IDÉNTICO a la definición original.

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
    ON ts.tenant_id    = c.tenant_id
   AND ts.phone_number = c.phone_number
  WHERE c.tenant_id = coalesce(auth.jwt() ->> 'tenant_id', '')::uuid
  ORDER BY c.phone_number, c.created_at DESC;
$$;

-- Solo usuarios autenticados pueden llamar la RPC (filtro por tenant_id en WHERE)
GRANT EXECUTE ON FUNCTION public.get_tenant_conversations_overview() TO authenticated;

-- Migration 045: RPC get_agent_kpis
-- Story perf-backend: reemplaza dos full-scans de `conversations` en Node.js
-- (hasta 10K filas truncadas) por un aggregate SQL que corre en el motor.
--
-- Retorna siempre exactamente 1 fila con:
--   total_conversaciones  — COUNT DISTINCT phone_number (mensajes de rol 'user')
--   response_time_avg_ms  — promedio ms de pares user→assistant consecutivos < 300s
--
-- Frontera de aislamiento: usa auth.jwt() ->> 'tenant_id' sin parámetro externo,
-- igual que las demás funciones SECURITY DEFINER del proyecto.
--
-- IMPORTANTE: este cambio de handler requiere que esta migración esté aplicada
-- en Supabase ANTES del deploy o el endpoint falla con "function not found".

CREATE OR REPLACE FUNCTION public.get_agent_kpis(
  desde timestamptz,
  hasta timestamptz
)
RETURNS TABLE (
  total_conversaciones bigint,
  response_time_avg_ms numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Evaluar el tenant_id una sola vez (evita llamar auth.jwt() múltiples veces)
  tenant_ctx AS (
    SELECT coalesce(auth.jwt() ->> 'tenant_id', '')::uuid AS tid
  ),
  -- Mensajes del tenant en el período (solo los roles relevantes)
  tenant_msgs AS (
    SELECT c.phone_number, c.role, c.created_at
    FROM public.conversations c, tenant_ctx t
    WHERE c.tenant_id = t.tid
      AND c.created_at BETWEEN desde AND hasta
      AND c.role IN ('user', 'assistant')
  ),
  -- Ventana deslizante para detectar pares user → assistant consecutivos
  lead_msgs AS (
    SELECT
      role                                                                                AS cur_role,
      LEAD(role)      OVER (PARTITION BY phone_number ORDER BY created_at)              AS next_role,
      EXTRACT(EPOCH FROM (
        LEAD(created_at) OVER (PARTITION BY phone_number ORDER BY created_at) - created_at
      )) * 1000                                                                          AS gap_ms
    FROM tenant_msgs
  ),
  -- Solo pares válidos: user→assistant con gap > 0 y < 300 s (respuesta real del agente)
  valid_gaps AS (
    SELECT gap_ms
    FROM lead_msgs
    WHERE cur_role  = 'user'
      AND next_role = 'assistant'
      AND gap_ms    >       0
      AND gap_ms    < 300000
  )
  SELECT
    -- Conversaciones únicas = usuarios distintos que escribieron en el período
    (SELECT COUNT(DISTINCT phone_number) FROM tenant_msgs WHERE role = 'user')  AS total_conversaciones,
    -- Tiempo de respuesta promedio (null si no hay pares válidos)
    (SELECT AVG(gap_ms) FROM valid_gaps)                                        AS response_time_avg_ms;
$$;

-- Solo usuarios autenticados pueden llamar la RPC (tenant aislado por JWT en WHERE)
GRANT EXECUTE ON FUNCTION public.get_agent_kpis(timestamptz, timestamptz) TO authenticated;

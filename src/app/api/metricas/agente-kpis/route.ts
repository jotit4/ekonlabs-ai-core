import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { AgentKPIs } from '@/types/metricas'

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json(
      { error: 'Solo administradores pueden ver métricas' },
      { status: 403 }
    )
  }

  // 3. Extraer y validar parámetros de período
  const { searchParams } = new URL(request.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  if (!desde || !hasta) {
    return Response.json(
      { error: 'Parámetros desde y hasta son requeridos' },
      { status: 400 }
    )
  }

  // Validación básica de formato ISO 8601
  const desdeDate = new Date(desde)
  const hastaDate = new Date(hasta)
  if (isNaN(desdeDate.getTime()) || isNaN(hastaDate.getTime())) {
    return Response.json(
      { error: 'Formato de fecha inválido. Use ISO 8601.' },
      { status: 400 }
    )
  }

  // Validación de rango invertido
  if (desdeDate.getTime() > hastaDate.getTime()) {
    return Response.json({ error: 'El rango de fechas es inválido' }, { status: 400 })
  }

  // 4. KPIs en paralelo:
  //   - RPC get_agent_kpis: calcula total_conversaciones + response_time_avg_ms en SQL
  //     (evita two full-scans de `conversations` con .range(0, 9999) en Node)
  //   - audit_logs unificado: una sola query devuelve count (escalaciones) Y data (takeover phones)
  //     para calcular containment_rate — reemplaza la doble query anterior
  //
  // IMPORTANTE: get_agent_kpis (migración 045) debe estar aplicada en Supabase antes del deploy.
  const [agentKpisResult, takeoverResult] = await Promise.all([
    supabase.rpc('get_agent_kpis', { desde, hasta }),
    supabase
      .from('audit_logs')
      .select('entity_id', { count: 'exact' })
      .eq('action', 'conversation_takeover')
      .gte('created_at', desde)
      .lte('created_at', hasta),
  ])

  const { data: agentKpisData, error: agentKpisError } = agentKpisResult
  const { data: takeoverLogs, count: escalacionesCount, error: takeoverError } = takeoverResult

  if (agentKpisError) {
    return Response.json({ error: 'Error al obtener KPIs del agente' }, { status: 500 })
  }

  if (takeoverError) {
    return Response.json({ error: 'Error al obtener datos de contención' }, { status: 500 })
  }

  // La RPC retorna siempre exactamente 1 fila (aggregates, never empty)
  const kpisRow = agentKpisData?.[0]
  const totalConversaciones = Number(kpisRow?.total_conversaciones ?? 0)
  // response_time_avg_ms viene como numeric de Postgres; puede ser null si no hay pares válidos
  const response_time_avg_ms =
    kpisRow?.response_time_avg_ms != null
      ? Math.round(Number(kpisRow.response_time_avg_ms))
      : null

  // Containment rate: % de conversaciones que NO escalaron a humano
  const takeoverPhones = new Set((takeoverLogs ?? []).map((l) => l.entity_id))
  const containment_rate =
    totalConversaciones > 0
      ? Math.round(
          ((totalConversaciones - takeoverPhones.size) / totalConversaciones) * 100
        )
      : null

  const agentKpis: AgentKPIs = {
    containment_rate,
    escalaciones: escalacionesCount ?? 0,
    fallback_rate: null, // Sin datos — FastAPI proxy en 501
    response_time_avg_ms,
    total_conversaciones: totalConversaciones,
    periodo_desde: desde,
    periodo_hasta: hasta,
  }

  return Response.json(
    { data: agentKpis },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
  )
}

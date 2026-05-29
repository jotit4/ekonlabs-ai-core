import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { AgentKPIs } from '@/types/metricas'

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Calcula el tiempo de respuesta promedio (ms) entre mensajes user → assistant.
 * Retorna null si no hay pares válidos en el período.
 */
async function calcularTiempoRespuestaAvg(
  supabase: SupabaseClient,
  desde: string,
  hasta: string
): Promise<number | null> {
  const { data: mensajes } = await supabase
    .from('conversations')
    .select('phone_number, role, created_at')
    .in('role', ['user', 'assistant'])
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .range(0, 9999)
    .order('phone_number', { ascending: true })
    .order('created_at', { ascending: true })

  if (!mensajes?.length) return null

  // Agrupar por phone_number
  const mensajesPorPhone = new Map<string, typeof mensajes>()
  for (const msg of mensajes) {
    if (!mensajesPorPhone.has(msg.phone_number)) {
      mensajesPorPhone.set(msg.phone_number, [])
    }
    mensajesPorPhone.get(msg.phone_number)!.push(msg)
  }

  const tiemposMs: number[] = []
  for (const msgs of mensajesPorPhone.values()) {
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
        const diffMs =
          new Date(msgs[i + 1].created_at).getTime() -
          new Date(msgs[i].created_at).getTime()
        // Ignorar pares > 5 minutos (no son respuestas reales del agente)
        if (diffMs > 0 && diffMs < 5 * 60 * 1000) {
          tiemposMs.push(diffMs)
        }
      }
    }
  }

  if (tiemposMs.length === 0) return null
  return Math.round(tiemposMs.reduce((a, b) => a + b, 0) / tiemposMs.length)
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
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

  // 4-8. Todos los KPIs en paralelo — RLS filtra por tenant automáticamente (AR14)
  const [
    escalacionesResult,
    phoneRowsResult,
    takeoverLogsResult,
    responseTimeResult,
  ] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'conversation_takeover')
      .gte('created_at', desde)
      .lte('created_at', hasta),
    supabase
      .from('conversations')
      .select('phone_number')
      .eq('role', 'user')
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .range(0, 9999),
    supabase
      .from('audit_logs')
      .select('entity_id')
      .eq('action', 'conversation_takeover')
      .gte('created_at', desde)
      .lte('created_at', hasta),
    calcularTiempoRespuestaAvg(supabase, desde, hasta).catch(() => null),
  ])

  const { count: escalacionesCount, error: escalacionesError } = escalacionesResult
  const { data: phoneRows, error: phonesError } = phoneRowsResult
  const { data: takeoverLogs, error: takeoverError } = takeoverLogsResult
  const response_time_avg_ms = responseTimeResult

  if (escalacionesError) {
    return Response.json({ error: 'Error al obtener escalaciones' }, { status: 500 })
  }

  if (phonesError) {
    return Response.json({ error: 'Error al obtener conversaciones' }, { status: 500 })
  }

  if (takeoverError) {
    return Response.json({ error: 'Error al obtener datos de contención' }, { status: 500 })
  }

  if ((phoneRows ?? []).length === 10000) {
    console.warn('[agente-kpis] Se alcanzó el límite de 10000 registros en phoneRows — los datos pueden estar incompletos')
  }

  const uniquePhones = new Set((phoneRows ?? []).map((r) => r.phone_number))
  const totalConversaciones = uniquePhones.size

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

  return Response.json({ data: agentKpis })
}

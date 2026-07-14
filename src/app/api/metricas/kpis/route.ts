import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { ClinicKPIs } from '@/types/metricas'

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
    return Response.json({ error: 'Solo administradores pueden ver métricas' }, { status: 403 })
  }

  // 3. Extraer y validar parámetros de período
  const { searchParams } = new URL(request.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  if (!desde || !hasta) {
    return Response.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
  }

  // Validación básica de formato ISO 8601
  const desdeDate = new Date(desde)
  const hastaDate = new Date(hasta)
  if (isNaN(desdeDate.getTime()) || isNaN(hastaDate.getTime())) {
    return Response.json({ error: 'Formato de fecha inválido. Use ISO 8601.' }, { status: 400 })
  }

  // Validación de rango invertido
  if (desdeDate.getTime() > hastaDate.getTime()) {
    return Response.json({ error: 'El rango de fechas es inválido' }, { status: 400 })
  }

  // 4-7. KPIs en paralelo con Promise.all — RLS filtra por tenant (AR14)
  const [turnosMesResult, noShowsResult, pacientesResult, ocupacionResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('appointment_id', { count: 'exact', head: true })
      .gte('start_at', desde)
      .lte('start_at', hasta),
    supabase
      .from('appointments')
      .select('appointment_id', { count: 'exact', head: true })
      .eq('status', 'no_show')
      .gte('start_at', desde)
      .lte('start_at', hasta),
    supabase
      .from('patients')
      .select('patient_id', { count: 'exact', head: true })
      .gte('created_at', desde)
      .lte('created_at', hasta),
    supabase
      .from('appointments')
      .select('appointment_id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'completed'])
      .gte('start_at', desde)
      .lte('start_at', hasta),
  ])

  const { count: turnosMes, error: turnosError } = turnosMesResult
  const { count: noShows, error: noShowsError } = noShowsResult
  const { count: pacientesNuevos, error: pacientesError } = pacientesResult
  const { count: confirmedOrCompleted, error: ocupacionError } = ocupacionResult

  if (turnosError) {
    return Response.json({ error: 'Error al obtener turnos' }, { status: 500 })
  }

  if (noShowsError) {
    return Response.json({ error: 'Error al obtener no-shows' }, { status: 500 })
  }

  if (pacientesError) {
    return Response.json({ error: 'Error al obtener pacientes nuevos' }, { status: 500 })
  }

  if (ocupacionError) {
    return Response.json({ error: 'Error al obtener ocupación' }, { status: 500 })
  }

  const totalTurnos = turnosMes ?? 0
  const ocupacionNumerador = confirmedOrCompleted ?? 0
  const ocupacionPct = totalTurnos > 0
    ? Math.round(ocupacionNumerador / totalTurnos * 100)
    : 0

  const kpis: ClinicKPIs = {
    ocupacion_pct: ocupacionPct,
    ocupacion_numerador: ocupacionNumerador,
    ocupacion_denominador: totalTurnos,
    no_shows: noShows ?? 0,
    turnos_mes: totalTurnos,
    pacientes_nuevos: pacientesNuevos ?? 0,
    periodo_desde: desde,
    periodo_hasta: hasta,
  }

  return Response.json(
    { data: kpis },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
  )
}

import 'server-only'
import { startOfISOWeek, formatISO, getISOWeek } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { WeeklyTrendData, TendenciasTurnosData } from '@/types/metricas'

const TZ = 'America/Argentina/Buenos_Aires'

function getSemanaKey(startAt: string): string {
  const fechaArg = toZonedTime(new Date(startAt), TZ)
  const inicioSemana = startOfISOWeek(fechaArg) // lunes de la semana ISO
  return formatISO(inicioSemana, { representation: 'date' }) // "2026-05-11"
}

function getSemanaLabel(isoDateStr: string): string {
  // Usar mediodía para evitar DST edge cases
  const fecha = new Date(isoDateStr + 'T12:00:00Z')
  const weekNum = getISOWeek(fecha)
  return `Sem ${weekNum}` // "Sem 18"
}

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

  // 4. Obtener turnos del período — agrupamiento en JS (evita timezone mismatch)
  // RLS filtra por tenant automáticamente — NO agregar .eq('tenant_id', ...) (AR14)
  const { data: appointments, error: appointmentsError } = await supabase
    .from('appointments')
    .select('start_at, status')
    .gte('start_at', desde)
    .lte('start_at', hasta)
    .range(0, 9999)
    .order('start_at', { ascending: true })

  if (appointmentsError) {
    return Response.json({ error: 'Error al obtener turnos' }, { status: 500 })
  }

  if ((appointments ?? []).length === 10000) {
    console.warn('[tendencias-turnos] Se alcanzó el límite de 10000 registros — los datos pueden estar incompletos')
  }

  // 5. Agrupar por semana ISO en timezone Argentina
  const semanas = new Map<string, WeeklyTrendData>()

  for (const appt of appointments ?? []) {
    const key = getSemanaKey(appt.start_at)
    if (!semanas.has(key)) {
      semanas.set(key, {
        semana_inicio: key,
        semana_label: getSemanaLabel(key),
        confirmados: 0,
        cancelados: 0,
        no_shows: 0,
        total: 0,
      })
    }
    const semana = semanas.get(key)!
    semana.total++
    if (appt.status === 'confirmed' || appt.status === 'completed') {
      semana.confirmados++
    } else if (appt.status === 'cancelled') {
      semana.cancelados++
    } else if (appt.status === 'no_show') {
      semana.no_shows++
    }
  }

  // 6. Ordenar cronológicamente
  const semanasOrdenadas = Array.from(semanas.values())
    .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))

  const tendenciasData: TendenciasTurnosData = {
    semanas: semanasOrdenadas,
    periodo_desde: desde,
    periodo_hasta: hasta,
  }

  return Response.json({ data: tendenciasData })
}

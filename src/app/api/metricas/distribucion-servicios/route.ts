import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { DistribucionServicioItem, DistribucionServiciosData } from '@/types/metricas'

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

  // 4. Queries en paralelo: appointments y services
  // RLS filtra por tenant automáticamente — AR14 (NO .eq('tenant_id', ...))
  const [appointmentsResult, servicesResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('service_id, status')
      .gte('start_at', desde)
      .lte('start_at', hasta)
      .range(0, 9999),
    supabase
      .from('services')
      .select('service_id, name, active'),
  ])

  if (appointmentsResult.error) {
    return Response.json({ error: 'Error al obtener turnos' }, { status: 500 })
  }
  if (servicesResult.error) {
    return Response.json({ error: 'Error al obtener servicios' }, { status: 500 })
  }

  const appointments = appointmentsResult.data ?? []
  const services = servicesResult.data ?? []

  if (appointments.length === 10000) {
    console.warn('[distribucion-servicios] Se alcanzó el límite de 10000 registros — los datos pueden estar incompletos')
  }

  // 5. Mapa de service_id → { name, active }
  const servicioMap = new Map<string, { name: string; active: boolean }>()
  for (const svc of services) {
    servicioMap.set(svc.service_id, { name: svc.name, active: svc.active })
  }

  // 6. Contar turnos por service_id (null si no tiene servicio)
  const conteo = new Map<string | null, number>()
  for (const appt of appointments) {
    const key = appt.service_id ?? null
    conteo.set(key, (conteo.get(key) ?? 0) + 1)
  }

  const totalTurnos = appointments.length

  // 7. Construir resultado con nombre y estado del servicio
  const servicios: DistribucionServicioItem[] = []
  for (const [serviceId, total] of conteo.entries()) {
    const info = serviceId ? servicioMap.get(serviceId) : null
    servicios.push({
      service_id: serviceId,
      nombre: info?.name ?? 'Sin servicio asignado',
      activo: info?.active ?? false,
      total,
      porcentaje: totalTurnos > 0 ? Math.round((total / totalTurnos) * 100) : 0,
    })
  }

  // 8. Ordenar por total descendente
  servicios.sort((a, b) => b.total - a.total)

  const data: DistribucionServiciosData = {
    servicios,
    total_turnos: totalTurnos,
    periodo_desde: desde,
    periodo_hasta: hasta,
  }

  return Response.json({ data })
}

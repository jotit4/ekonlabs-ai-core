import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { eachDayOfInterval, formatISO, parseISO, isValid, differenceInCalendarDays } from 'date-fns'
import type { AvailabilityShift, DayShifts, DaySummary } from '@/types/availability'

// GET /api/availability
// Envuelve la RPC `check_clinic_availability` (migración 029) e itera el rango
// de fechas server-side (una llamada a la RPC por día) en un solo round-trip
// HTTP. Devuelve los huecos libres por día (modo shifts) o solo el conteo
// (modo summary, para la vista Mes).
//
// CRÍTICO (AR14/AR15): la RPC es SECURITY DEFINER y omite RLS de las tablas
// internas. `p_org_id` es la única frontera de aislamiento → SIEMPRE del JWT,
// nunca del query/body. No usar admin.ts.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 60

interface RpcRow {
  available: boolean
  shifts: AvailabilityShift[] | null
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. tenant_id + rol del JWT
  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Autorización — admin o receptionist (la recepcionista es la usuaria principal)
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. Query params
  const searchParams = new URL(request.url).searchParams
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const serviceId = searchParams.get('service_id')
  const professionalId = searchParams.get('professional_id')
  const summary = searchParams.get('summary') === 'true'

  // 5. Validación de params
  if (!dateFrom || !dateTo) {
    return Response.json({ error: 'date_from y date_to son requeridos' }, { status: 400 })
  }
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return Response.json({ error: 'Formato de fecha inválido (se espera YYYY-MM-DD)' }, { status: 400 })
  }

  const fromDate = parseISO(dateFrom)
  const toDate = parseISO(dateTo)
  if (!isValid(fromDate) || !isValid(toDate)) {
    return Response.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  const spanDays = differenceInCalendarDays(toDate, fromDate)
  if (spanDays < 0) {
    return Response.json({ error: 'date_to no puede ser anterior a date_from' }, { status: 400 })
  }
  if (spanDays + 1 > MAX_RANGE_DAYS) {
    return Response.json({ error: `El rango no puede superar ${MAX_RANGE_DAYS} días` }, { status: 400 })
  }

  // 6. Lista de fechas del rango (inclusive)
  const isoDays = eachDayOfInterval({ start: fromDate, end: toDate }).map((d) =>
    formatISO(d, { representation: 'date' }),
  )

  // 7. Iterar server-side — una llamada a la RPC por día
  const daysShifts: Record<string, DayShifts> = {}
  const daysSummary: Record<string, DaySummary> = {}

  for (const isoDay of isoDays) {
    const { data, error } = await supabase.rpc('check_clinic_availability', {
      p_org_id: tenantId,
      p_date: isoDay,
      // p_timezone se omite → usa el DEFAULT de la RPC (America/Argentina/Buenos_Aires)
      p_service_id: serviceId ?? undefined,
      p_professional_id: professionalId ?? undefined,
    })

    if (error) {
      console.error('[availability/GET] rpc error:', error)
      return Response.json({ error: 'Error al calcular la disponibilidad' }, { status: 500 })
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
    const shifts = (row?.shifts ?? []) as AvailabilityShift[]

    if (summary) {
      daysSummary[isoDay] = { free_count: shifts.length }
    } else {
      daysShifts[isoDay] = { available: row?.available ?? false, shifts }
    }
  }

  return Response.json({ days: summary ? daysSummary : daysShifts })
}

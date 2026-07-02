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
  // P0.1 — "Cualquier profesional disponible": cuando se pide un servicio sin
  // profesional concreto, iterar TODOS los profesionales del servicio y unir sus
  // huecos (sin colapsar por hora) para que cada hueco conserve su profesional.
  const allProfessionals =
    searchParams.get('all_professionals') === 'true' && !!serviceId && !professionalId

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

  // 6.b. Modo "todos los profesionales": resolver la lista de profesionales del
  // servicio UNA sola vez (no por día). RLS filtra service_professionals por
  // tenant vía el JOIN a professionals → no agregar .eq('tenant_id', ...) (AR14).
  let serviceProfessionalIds: string[] | null = null
  if (allProfessionals) {
    const { data: spData, error: spError } = await supabase
      .from('service_professionals')
      .select('professional_id, professionals ( professional_id, active )')
      .eq('service_id', serviceId as string)

    if (spError) {
      console.error('[availability/GET] service_professionals error:', spError)
      return Response.json({ error: 'Error al calcular la disponibilidad' }, { status: 500 })
    }

    type ProfRow = { professional_id: string; active: boolean } | null
    serviceProfessionalIds = (spData ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => row.professionals as ProfRow)
      .filter((p): p is { professional_id: string; active: boolean } => p != null && p.active === true)
      .map((p) => p.professional_id)
  }

  // 7. Iterar server-side — una llamada a la RPC por día (y por profesional en
  // modo "todos los profesionales").
  const daysShifts: Record<string, DayShifts> = {}
  const daysSummary: Record<string, DaySummary> = {}

  for (const isoDay of isoDays) {
    let shifts: AvailabilityShift[]
    let available: boolean

    if (serviceProfessionalIds) {
      // Unir los huecos de cada profesional del servicio. Cada llamada filtra por
      // un profesional → la RPC NO colapsa por hora, así cada hueco mantiene su
      // professional_id/professional_name.
      const merged: AvailabilityShift[] = []
      for (const profId of serviceProfessionalIds) {
        const { data, error } = await supabase.rpc('check_clinic_availability', {
          p_org_id: tenantId,
          p_date: isoDay,
          p_service_id: serviceId ?? undefined,
          p_professional_id: profId,
        })
        if (error) {
          console.error('[availability/GET] rpc error:', error)
          return Response.json({ error: 'Error al calcular la disponibilidad' }, { status: 500 })
        }
        const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
        merged.push(...((row?.shifts ?? []) as AvailabilityShift[]))
      }
      // Ordenar por hora de inicio y, a igualdad, por nombre del profesional.
      merged.sort(
        (a, b) =>
          a.slot_start_iso.localeCompare(b.slot_start_iso) ||
          a.professional_name.localeCompare(b.professional_name),
      )
      shifts = merged
      available = merged.length > 0
    } else {
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
      shifts = (row?.shifts ?? []) as AvailabilityShift[]
      available = row?.available ?? false
    }

    if (summary) {
      daysSummary[isoDay] = { free_count: shifts.length }
    } else {
      daysShifts[isoDay] = { available, shifts }
    }
  }

  return Response.json({ days: summary ? daysSummary : daysShifts })
}

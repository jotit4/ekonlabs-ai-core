import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
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
// Mismo patrón UUID_REGEX usado en appointments/[id], patients/[id]/clinical-data,
// treatments/[id]/discharge, etc. — formato UUID genérico (no exige la variante v4).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// B3 (hardening) — el grupo real (Fisioterapia/Pileta/Pilates) tiene ~3 service_id.
// 10 es holgado sobre ese uso real y evita que N servicios x M profesionales x
// MAX_RANGE_DAYS días dispare cientos/miles de llamadas a la RPC.
const MAX_SERVICE_IDS = 10

interface RpcRow {
  available: boolean
  shifts: AvailabilityShift[] | null
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
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
  // Pedido 1 (ISADI 2026-07-16) — "Dar un turno" de recepción para el grupo
  // Fisioterapia: varios service_id a la vez (comma-separated), CON PRIORIDAD
  // sobre `service_id` cuando ambos llegan. Ver 6.c más abajo.
  const serviceIdsParam = searchParams.get('service_ids')
  // B3 (hardening) — dedup preservando orden (un id repetido no debe multiplicar
  // llamadas a la RPC) antes de validar formato/cantidad más abajo (paso 5).
  const serviceIdList = serviceIdsParam
    ? [...new Set(serviceIdsParam.split(',').map((s) => s.trim()).filter(Boolean))]
    : null
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

  // B3 (hardening) — service_ids: límite de cantidad + UUID de cada elemento.
  // Evita que un id malformado llegue a `.eq('service_id', sid)`/la RPC (→ 500)
  // y que una lista desmedida dispare cientos de llamadas (N servicios x M
  // profesionales x MAX_RANGE_DAYS días).
  if (serviceIdList && serviceIdList.length > 0) {
    if (serviceIdList.length > MAX_SERVICE_IDS) {
      return Response.json(
        { error: `service_ids no puede tener más de ${MAX_SERVICE_IDS} elementos` },
        { status: 400 },
      )
    }
    const invalidId = serviceIdList.find((sid) => !UUID_REGEX.test(sid))
    if (invalidId) {
      return Response.json({ error: `service_ids contiene un id inválido: ${invalidId}` }, { status: 400 })
    }
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

  // 6.c. Modo GRUPO (Pedido 1 ISADI 2026-07-16 — "Dar un turno" de recepción
  // para el grupo Fisioterapia): varios service_id a la vez. Para cada uno se
  // resuelve QUÉ profesionales consultar — el `professional_id` concreto si
  // vino explícito, o TODOS sus profesionales activos (mismo criterio que
  // `all_professionals` para un único servicio). Se resuelve UNA vez (no por
  // día), igual que `serviceProfessionalIds` arriba.
  let groupServiceProfessionals: Record<string, string[]> | null = null
  if (serviceIdList && serviceIdList.length > 0) {
    groupServiceProfessionals = {}
    if (professionalId) {
      for (const sid of serviceIdList) {
        groupServiceProfessionals[sid] = [professionalId]
      }
    } else {
      for (const sid of serviceIdList) {
        const { data: spData, error: spError } = await supabase
          .from('service_professionals')
          .select('professional_id, professionals ( professional_id, active )')
          .eq('service_id', sid)

        if (spError) {
          console.error('[availability/GET] service_professionals error (group):', spError)
          return Response.json({ error: 'Error al calcular la disponibilidad' }, { status: 500 })
        }

        type ProfRow = { professional_id: string; active: boolean } | null
        groupServiceProfessionals[sid] = (spData ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((row: any) => row.professionals as ProfRow)
          .filter((p): p is { professional_id: string; active: boolean } => p != null && p.active === true)
          .map((p) => p.professional_id)
      }
    }
  }

  // 7. Iterar server-side — una llamada a la RPC por día (y por profesional en
  // modo "todos los profesionales").
  const daysShifts: Record<string, DayShifts> = {}
  const daysSummary: Record<string, DaySummary> = {}

  for (const isoDay of isoDays) {
    let shifts: AvailabilityShift[]
    let available: boolean

    if (groupServiceProfessionals) {
      // Unir los huecos de CADA service_id del grupo x CADA uno de sus
      // profesionales (o el professional_id concreto si vino explícito).
      const merged: AvailabilityShift[] = []
      for (const sid of serviceIdList!) {
        const profIds = groupServiceProfessionals[sid] ?? []
        for (const profId of profIds) {
          const { data, error } = await supabase.rpc('check_clinic_availability', {
            p_org_id: tenantId,
            p_date: isoDay,
            p_service_id: sid,
            p_professional_id: profId,
          })
          if (error) {
            console.error('[availability/GET] rpc error (group):', error)
            return Response.json({ error: 'Error al calcular la disponibilidad' }, { status: 500 })
          }
          const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
          merged.push(...((row?.shifts ?? []) as AvailabilityShift[]))
        }
      }
      merged.sort(
        (a, b) =>
          a.slot_start_iso.localeCompare(b.slot_start_iso) ||
          a.professional_name.localeCompare(b.professional_name),
      )
      shifts = merged
      available = merged.length > 0
    } else if (serviceProfessionalIds) {
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

  let totalShifts = 0
  if (summary) {
    totalShifts = Object.values(daysSummary).reduce((acc, d) => acc + d.free_count, 0)
  } else {
    totalShifts = Object.values(daysShifts).reduce((acc, d) => acc + d.shifts.length, 0)
  }

  let diagnostic: { code: string; message: string } | null = null

  if (totalShifts === 0) {
    const dateObj = new Date(dateFrom + 'T00:00:00')
    const serviceDow = dateObj.getDay()
    const profDow = (serviceDow + 6) % 7

    const sIds = serviceIdList || (serviceId ? [serviceId] : [])
    let hasServiceHours = false
    if (sIds.length > 0) {
      const { data: shRows } = await supabase
        .from('service_hours')
        .select('id')
        .in('service_id', sIds)
        .eq('day_of_week', serviceDow)
        .eq('active', true)
        .limit(1)
      if (shRows && shRows.length > 0) {
        hasServiceHours = true
      }
    }

    const pIds: string[] = []
    if (professionalId) {
      pIds.push(professionalId)
    } else if (serviceProfessionalIds) {
      pIds.push(...serviceProfessionalIds)
    } else if (groupServiceProfessionals) {
      Object.values(groupServiceProfessionals).forEach((ids) => {
        pIds.push(...ids)
      })
    }

    if (pIds.length === 0 && sIds.length > 0) {
      const { data: spRows } = await supabase
        .from('service_professionals')
        .select('professional_id')
        .in('service_id', sIds)
      if (spRows) {
        pIds.push(...spRows.map((r) => r.professional_id))
      }
    }

    let hasProfSchedules = false
    if (pIds.length > 0) {
      const { data: psRows } = await supabase
        .from('professional_schedules')
        .select('id')
        .in('professional_id', pIds)
        .eq('day_of_week', profDow)
        .limit(1)
      if (psRows && psRows.length > 0) {
        hasProfSchedules = true
      }
    }

    if (!hasServiceHours && !hasProfSchedules) {
      diagnostic = {
        code: 'no_schedule',
        message: 'El profesional no tiene horarios configurados para este día de la semana.',
      }
    } else {
      let isBlocked = false
      if (pIds.length > 0) {
        const { data: blockRows } = await supabase
          .from('blocked_times')
          .select('block_id')
          .in('professional_id', pIds)
          .lte('date_from', dateFrom)
          .gte('date_to', dateFrom)
          .limit(1)
        if (blockRows && blockRows.length > 0) {
          isBlocked = true
        }
      }

      if (isBlocked) {
        diagnostic = {
          code: 'professional_blocked',
          message: 'El profesional se encuentra de vacaciones o bloqueado.',
        }
      }
    }
  }

  return Response.json({
    days: summary ? daysSummary : daysShifts,
    diagnostic,
  })
}

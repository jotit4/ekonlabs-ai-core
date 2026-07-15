import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { setClinicDayStatusSchema } from '@/lib/schemas/day-status.schema'
import { computeEffectiveOpen } from '@/lib/agenda/day-status'
import type { DayStatusEntry, NationalHoliday, ClinicDayStatusRow } from '@/types/holidays'

// GET/POST /api/agenda/day-status — feriados nacionales + decisión de la
// clínica "¿este día abre?" (pedido ISADI 2026-07-14). Mismo modelo que
// consume la RPC `check_clinic_availability` (migración 052): un día está
// efectivamente cerrado si hay una decisión explícita is_open=FALSE, o si es
// feriado nacional y no hay una decisión explícita is_open=TRUE.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Cubre el peor caso de la vista Mes (hasta 6 semanas ≈ 42 días visibles).
const MAX_RANGE_DAYS = 62

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId } : null
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. tenant_id + rol del JWT
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Autorización — LECTURA abierta a los 3 roles: a diferencia de
  // /api/availability (que solo admin/receptionist pueden consultar para
  // agendar), acá no hay datos sensibles — "¿está cerrado hoy?" lo necesita
  // cualquiera que vea la agenda, incluido el rol doctor (Semana/Mes).
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist' && role !== 'doctor') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. Query params
  const searchParams = new URL(request.url).searchParams
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  if (!dateFrom || !dateTo) {
    return Response.json({ error: 'date_from y date_to son requeridos' }, { status: 400 })
  }
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return Response.json({ error: 'Formato de fecha inválido (se espera YYYY-MM-DD)' }, { status: 400 })
  }
  if (dateTo < dateFrom) {
    return Response.json({ error: 'date_to no puede ser anterior a date_from' }, { status: 400 })
  }
  const spanDays =
    (new Date(`${dateTo}T00:00:00Z`).getTime() - new Date(`${dateFrom}T00:00:00Z`).getTime()) / 86_400_000
  if (spanDays + 1 > MAX_RANGE_DAYS) {
    return Response.json({ error: `El rango no puede superar ${MAX_RANGE_DAYS} días` }, { status: 400 })
  }

  // 5. Catálogo de feriados (global, solo lectura) + decisiones del tenant
  // (RLS filtra tenant automáticamente — no agregar .eq('tenant_id', ...), AR14)
  const [holidaysResult, statusResult] = await Promise.all([
    supabase
      .from('holidays')
      .select('holiday_id, country, holiday_date, name')
      .eq('country', 'AR')
      .gte('holiday_date', dateFrom)
      .lte('holiday_date', dateTo),
    supabase
      .from('clinic_day_status')
      .select('day_status_id, tenant_id, status_date, is_open, reason, decided_by, decided_by_name, decided_at')
      .gte('status_date', dateFrom)
      .lte('status_date', dateTo),
  ])

  if (holidaysResult.error || statusResult.error) {
    console.error(
      '[agenda/day-status/GET] error:',
      holidaysResult.error ?? statusResult.error,
    )
    return Response.json({ error: 'Error al obtener el estado de los días' }, { status: 500 })
  }

  // 6. Merge — solo se listan días "especiales" (feriado y/o con decisión);
  // un día ausente del mapa es un día normal abierto (sin badge en la UI).
  const days: Record<string, DayStatusEntry> = {}

  for (const h of (holidaysResult.data ?? []) as NationalHoliday[]) {
    days[h.holiday_date] = {
      date: h.holiday_date,
      isHoliday: true,
      holidayName: h.name,
      decisionIsOpen: null,
      decidedByName: null,
      decidedAt: null,
      reason: null,
      effectiveOpen: false,
    }
  }

  for (const s of (statusResult.data ?? []) as ClinicDayStatusRow[]) {
    const existing = days[s.status_date]
    days[s.status_date] = {
      date: s.status_date,
      isHoliday: existing?.isHoliday ?? false,
      holidayName: existing?.holidayName ?? null,
      decisionIsOpen: s.is_open,
      decidedByName: s.decided_by_name,
      decidedAt: s.decided_at,
      reason: s.reason,
      effectiveOpen: false,
    }
  }

  for (const date of Object.keys(days)) {
    const entry = days[date]
    entry.effectiveOpen = computeEffectiveOpen({
      isHoliday: entry.isHoliday,
      decisionIsOpen: entry.decisionIsOpen,
    })
  }

  return Response.json({ days })
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId } : null
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. tenant_id + rol del JWT
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Autorización — decidir el estado del día es una acción operativa de
  // administración/recepción (la usuaria principal de la agenda). El rol
  // doctor puede LEER (GET) pero no decide horarios de la clínica.
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json(
      { error: 'Solo administración o recepción pueden decidir el estado de un día' },
      { status: 403 },
    )
  }

  // 4. Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = setClinicDayStatusSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { date, is_open, reason } = parsed.data
  const decidedByName =
    (claims?.full_name as string | undefined) ?? (claims?.email as string | undefined) ?? null
  const nowIso = new Date().toISOString()

  // 5. Upsert — tenant_id explícito desde claims (AR14, mismo patrón que
  // /api/servicios/[id]/excepciones). decided_at/updated_at se pisan siempre
  // con "ahora" para que reflejen la ÚLTIMA decisión, no solo la primera.
  const { data, error } = await supabase
    .from('clinic_day_status')
    .upsert(
      {
        tenant_id: tenantId,
        status_date: date,
        is_open,
        reason: reason ?? null,
        decided_by: sessionAuth?.userId ?? null,
        decided_by_name: decidedByName,
        decided_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'tenant_id,status_date' },
    )
    .select('day_status_id, tenant_id, status_date, is_open, reason, decided_by, decided_by_name, decided_at')
    .single()

  if (error) {
    console.error('[agenda/day-status/POST] upsert error:', error)
    return Response.json({ error: 'Error al guardar la decisión' }, { status: 500 })
  }

  // 6. Audit log
  await logAudit({
    action: 'clinic_day_status_updated',
    entity_type: 'clinic_day_status',
    entity_id: date,
    supabase,
  })

  return Response.json({ data }, { status: 200 })
}

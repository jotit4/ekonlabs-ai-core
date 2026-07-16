import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { createSessionsApiSchema } from '@/lib/schemas/treatment-session.schema'

// POST /api/treatments/[id]/sessions
// Agenda sesiones de un BONO de forma MANUAL Y FLEXIBLE (reclamo ISADI): recibe
// una lista de slots elegidos de la disponibilidad REAL del profesional+servicio
// del paquete y crea los appointments correspondientes, ligándolos al paquete.
//
// La creación es ATÓMICA vía RPC `create_package_sessions` (054): toma FOR UPDATE
// del treatment, recalcula cupo y session_index BAJO ESE LOCK, y crea+liga cada
// turno (reusando `create_appointment` 029 — anti-overbooking por profesional +
// idempotencia) dentro de un savepoint por slot. Esto cierra dos fallas de
// integridad que tenía el bucle anterior en JS: requests paralelos que superaban
// total_sessions / repetían session_index, y el turno que quedaba huérfano si el
// UPDATE de ligado fallaba. Las validaciones de UX previas (404/409/422) se
// conservan como pre-chequeo best-effort; la RPC es la autoridad final.
//
// CRÍTICO (AR14/AR15): tenant_id SIEMPRE del JWT (nunca del body). La RPC es
// SECURITY DEFINER → recibe `p_org_id = tenantId` como frontera de aislamiento.
// Las queries autenticadas a `treatments` filtran por RLS → NO `.eq('tenant_id')`.
// NO admin.ts. `await params` (ruta dinámica Next.js 16).

// Retorno de la RPC create_package_sessions (054): cuántos turnos NUEVOS se crearon
// y qué slots se saltearon, con el motivo (para el 409 all-conflict y para que el
// frontend pueda, a futuro, informar los parciales).
interface PackageSessionsResult {
  creadas: number
  skipped: { start_at?: string; reason: string }[] | null
}

// Forma del paquete que esta ruta consume (select con join a appointments).
interface TreatmentRow {
  treatment_id: string
  patient_id: string
  service_id: string
  professional_id: string | null
  total_sessions: number
  status: string
  appointments: { session_index: number | null; status: string }[] | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. tenant_id + rol del JWT — NUNCA del body (AR-tenant)
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Autorización por rol — admin o receptionist (la recepcionista agenda)
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. id del path (params es Promise en Next.js 16)
  const { id: treatmentId } = await params

  // 5. Parsear y validar body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = createSessionsApiSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 },
    )
  }
  // `color` es OPCIONAL y único para TODA la tanda (Pedido 6 ISADI 2026-07-14/16):
  // sin elegir ninguno, las sesiones se crean sin color (comportamiento actual).
  const { slots, color } = parsed.data

  // 6. Cargar el paquete (RLS 038 filtra por tenant — NO .eq('tenant_id'), AR14).
  //    De acá salen patient_id / service_id / professional_id REALES: no se confía
  //    en nada del body para esos campos.
  const { data: treatmentData, error: treatmentError } = await supabase
    .from('treatments')
    .select(
      'treatment_id, patient_id, service_id, professional_id, total_sessions, status, ' +
        'appointments(session_index, status)',
    )
    .eq('treatment_id', treatmentId)
    .maybeSingle()

  if (treatmentError) {
    console.error('[treatments/sessions] load error:', treatmentError)
    return Response.json({ error: 'Error al cargar el paquete' }, { status: 500 })
  }
  if (!treatmentData) {
    return Response.json({ error: 'Paquete no encontrado' }, { status: 404 })
  }
  const treatment = treatmentData as unknown as TreatmentRow
  if (treatment.status !== 'active') {
    return Response.json({ error: 'El paquete no está activo' }, { status: 409 })
  }

  // El paquete puede tener un profesional FIJO, o ninguno ("cualquier profesional
  // disponible" — Pedido A #2/#3 ISADI 2026-07-14). Con profesional fijo, TODAS
  // las sesiones usan ese profesional (sin cambios). Sin profesional fijo, CADA
  // slot debe traer el suyo (resuelto por la recepcionista al elegir el hueco) —
  // se valida acá, antes de crear nada.
  const treatmentProfessionalId = treatment.professional_id
  if (!treatmentProfessionalId) {
    const missingProfessional = slots.some((s) => !s.professional_id)
    if (missingProfessional) {
      return Response.json(
        { error: 'Este paquete no tiene profesional fijo: elegí un profesional para cada sesión' },
        { status: 422 },
      )
    }
  }
  const totalSessions = treatment.total_sessions

  // 7. Pre-chequeo de cupo (best-effort, para dar buenos mensajes de UX). El
  //    contador HONESTO deriva de los appointments reales (mismo criterio que
  //    treatmentProgress): "agendadas" = turnos NO cancelados; `por_agendar` es
  //    el cupo libre del bono. La AUTORIDAD final es la RPC (recalcula bajo lock);
  //    esto sólo evita llamarla cuando ya se sabe que no hay lugar.
  const SCHEDULED = new Set(['confirmed', 'completed', 'no_show', 'pending_calendar'])
  const existingAppts = treatment.appointments ?? []
  const agendadas = existingAppts.filter((a) => SCHEDULED.has(a.status)).length
  const porAgendar = Math.max(0, totalSessions - agendadas)

  if (porAgendar === 0) {
    return Response.json(
      { error: 'El paquete ya tiene todas sus sesiones agendadas' },
      { status: 409 },
    )
  }
  if (slots.length > porAgendar) {
    return Response.json(
      {
        error: `Elegiste ${slots.length} sesiones pero al paquete solo le faltan ${porAgendar} por agendar`,
      },
      { status: 422 },
    )
  }

  // 8. Crear las sesiones DE FORMA ATÓMICA (054). El cupo y el session_index los
  //    recalcula la RPC bajo `FOR UPDATE` del treatment (autoritativo), así que
  //    acá NO se calcula el índice ni se hace un UPDATE de ligado por separado:
  //    todo (create_appointment + ligado package_id/session_index/color) corre en
  //    una sola transacción con savepoint por slot. `professional_id` se resuelve
  //    por slot igual que antes (fijo del paquete o el del hueco) — la RPC lo
  //    valida de todos modos.
  const rpcSlots = slots.map((s) => ({
    start_at: s.start_at,
    end_at: s.end_at,
    professional_id: treatmentProfessionalId ?? s.professional_id ?? null,
  }))

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_package_sessions', {
    p_org_id: tenantId,
    p_treatment_id: treatmentId,
    p_slots: rpcSlots,
    p_color: color ?? null,
    p_booked_via: 'manual',
  })

  if (rpcError) {
    console.error('[treatments/sessions] create_package_sessions error:', rpcError)
    return Response.json({ error: 'No se pudieron agendar las sesiones' }, { status: 500 })
  }

  const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PackageSessionsResult | undefined
  const creadas = result?.creadas ?? 0
  const skipped = result?.skipped ?? []

  // 9. Audit log — DESPUÉS de procesar (entity_id = treatment_id).
  if (creadas > 0) {
    await logAudit({
      action: 'treatment_sessions_scheduled',
      entity_type: 'treatment',
      entity_id: treatmentId,
      supabase,
    })
  }

  // 10. Si NO se creó ninguna y todas fueron conflicto de slot (o cupo agotado por
  //     una carrera) → 409: la UI invalida y refresca la disponibilidad para
  //     reelegir. Si hubo al menos una, 201 con el resumen (creadas + skipped).
  const noneCreated = creadas === 0 && skipped.length > 0
  const allConflict = noneCreated && skipped.every((s) => s.reason === 'slot_conflict')
  const allNoCapacity = noneCreated && skipped.every((s) => s.reason === 'no_capacity')
  if (allConflict) {
    return Response.json(
      { error: 'Esos horarios ya no están disponibles', creadas, skipped },
      { status: 409 },
    )
  }
  if (allNoCapacity) {
    return Response.json(
      { error: 'El paquete ya tiene todas sus sesiones agendadas', creadas, skipped },
      { status: 409 },
    )
  }

  return Response.json(
    { success: true, treatment_id: treatmentId, creadas, skipped },
    { status: 201 },
  )
}

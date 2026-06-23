import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { createSessionsApiSchema } from '@/lib/schemas/treatment-session.schema'

// POST /api/treatments/[id]/sessions
// Agenda sesiones de un BONO de forma MANUAL Y FLEXIBLE (reclamo ISADI): recibe
// una lista de slots elegidos de la disponibilidad REAL del profesional+servicio
// del paquete y crea los appointments correspondientes, ligándolos al paquete.
//
// Reusa el MISMO camino de creación que la agenda y la generación de series:
// RPC `create_appointment` (029, anti-overbooking POR PROFESIONAL + idempotencia)
// y luego un UPDATE del turno con `package_id` / `session_index`. NO inventa un
// mecanismo nuevo de creación de turnos.
//
// CRÍTICO (AR14/AR15): tenant_id SIEMPRE del JWT (nunca del body). La RPC es
// SECURITY DEFINER → recibe `p_org_id = tenantId` como frontera de aislamiento.
// Las queries autenticadas a `treatments` / `appointments` filtran por RLS → NO
// `.eq('tenant_id')`. NO admin.ts. `await params` (ruta dinámica Next.js 16).
//
// `session_index` se asigna correlativo: max(session_index existente del paquete) + 1,
// incremental por cada turno NUEVO de esta corrida.

interface CreateApptRow {
  success: boolean
  appointment_id: string | null
  short_id: string | null
  duplicate: boolean
  error: string | null
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
  const { data: { user } } = await supabase.auth.getUser()
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
  const { slots } = parsed.data

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

  const professionalId = treatment.professional_id
  if (!professionalId) {
    return Response.json({ error: 'El paquete no tiene profesional asignado' }, { status: 422 })
  }
  const patientId = treatment.patient_id
  const serviceId = treatment.service_id
  const totalSessions = treatment.total_sessions

  // 7. Contador HONESTO derivado de los appointments reales (mismo criterio que
  //    treatmentProgress): "agendadas" = turnos NO cancelados. `por_agendar` es el
  //    cupo libre del bono. No se permite sobre-agendar más allá del total.
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

  // 8. Próximo session_index = max(existente) + 1, incremental por turno NUEVO.
  let nextSessionIndex =
    existingAppts.reduce((max, a) => Math.max(max, a.session_index ?? 0), 0) + 1

  // 9. Crear cada turno con el MISMO camino que la agenda / generación:
  //    paso 1 → create_appointment (029, candado + idempotencia)
  //    paso 2 → UPDATE package_id / session_index sobre el id DEVUELTO por la RPC.
  let creadas = 0
  const skipped: { start_at: string; reason: string }[] = []

  for (const slot of slots) {
    const startAt = new Date(slot.start_at)
    const endAt = new Date(slot.end_at)
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      skipped.push({ start_at: slot.start_at, reason: 'invalid_date' })
      continue
    }

    const generatedId = crypto.randomUUID()
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_appointment', {
      p_org_id: tenantId,
      p_patient_id: patientId,
      p_service_id: serviceId,
      p_start: startAt.toISOString(),
      p_end: endAt.toISOString(),
      p_appointment_id: generatedId,
      p_professional_id: professionalId,
      p_booked_via: 'manual',
    })

    if (rpcError) {
      console.error('[treatments/sessions] create_appointment error:', rpcError)
      skipped.push({ start_at: slot.start_at, reason: 'rpc_error' })
      continue
    }

    const apptRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as CreateApptRow | undefined
    if (!apptRow || !apptRow.success || !apptRow.appointment_id) {
      // p.ej. professional_service_mismatch
      console.warn('[treatments/sessions] create_appointment falló:', apptRow?.error)
      skipped.push({ start_at: slot.start_at, reason: apptRow?.error ?? 'create_failed' })
      continue
    }

    if (apptRow.duplicate) {
      // El slot ya estaba ocupado (candado / idempotencia): no consume cupo ni
      // session_index. Lo informamos como conflicto, no como creado.
      skipped.push({ start_at: slot.start_at, reason: 'slot_conflict' })
      continue
    }

    // Paso 2: ligar el turno NUEVO al paquete. RLS de appointments filtra por
    // tenant — NO .eq('tenant_id') (AR14). Usar el id DEVUELTO por la RPC.
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ package_id: treatmentId, session_index: nextSessionIndex })
      .eq('appointment_id', apptRow.appointment_id)

    if (updateError) {
      console.error('[treatments/sessions] update package_id error:', updateError)
      // El turno quedó creado pero sin ligar: lo contamos igual como creado (existe)
      // y avanzamos el índice para no reasignar el mismo a otra sesión.
    }

    creadas += 1
    nextSessionIndex += 1
  }

  // 10. Audit log — DESPUÉS de procesar (entity_id = treatment_id).
  if (creadas > 0) {
    await logAudit({
      action: 'treatment_sessions_scheduled',
      entity_type: 'treatment',
      entity_id: treatmentId,
      supabase,
    })
  }

  // 11. Si NO se creó ninguna y todas fueron conflicto → 409 (la UI invalida y
  //     refresca la disponibilidad). Si hubo al menos una, 201 con el resumen.
  const allConflict =
    creadas === 0 && skipped.length > 0 && skipped.every((s) => s.reason === 'slot_conflict')
  if (allConflict) {
    return Response.json(
      { error: 'Esos horarios ya no están disponibles', creadas, skipped },
      { status: 409 },
    )
  }

  return Response.json(
    { success: true, treatment_id: treatmentId, creadas, skipped },
    { status: 201 },
  )
}

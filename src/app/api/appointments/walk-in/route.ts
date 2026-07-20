import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { walkInApiSchema } from '@/lib/schemas/appointment.schema'
import { startOfDay, endOfDay } from 'date-fns'

// Story 16.1 — POST /api/appointments/walk-in
// Registra a un paciente en la cola de orden de llegada de un servicio con
// `allow_walk_in=true`. Un walk-in es un `appointment` con `is_walk_in=true` y
// `start_at=now()` (hora de llegada, ordena la cola). Reusa la tabla y la RLS de
// appointments (admin/receptionist pueden insertar cualquier turno del tenant).

// Tope de reintentos ante el índice UNIQUE anti-overbooking por profesional
// (migración 029: tenant_id, professional_id, start_at). Dos walk-ins en el
// mismísimo instante para el mismo profesional colisionan; se reintenta
// desplazando start_at unos ms (la colisión real es casi imposible).
const MAX_INSERT_RETRIES = 3

export async function POST(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Autorización — solo admin/receptionist anotan llegadas (el rol doctor
  //    marca "atendido" pero no registra la cola; patrón de day-status POST).
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json(
      { error: 'Solo administración o recepción pueden registrar llegadas' },
      { status: 403 },
    )
  }

  // 3. Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = walkInApiSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { patient_id, service_id, professional_id } = parsed.data

  // 4. El servicio debe admitir walk-in. RLS de services filtra por tenant (AR14).
  const { data: svcRow, error: svcError } = await supabase
    .from('services')
    .select('allow_walk_in, duration_minutes')
    .eq('service_id', service_id)
    .maybeSingle()

  if (svcError) {
    console.error('[appointments/walk-in/POST] service read error:', svcError)
    return Response.json({ error: 'Error al validar el servicio' }, { status: 500 })
  }
  if (!svcRow || svcRow.allow_walk_in !== true) {
    return Response.json({ error: 'service_not_walk_in' }, { status: 400 })
  }
  const durationMinutes = svcRow.duration_minutes ?? 60

  // 5. El profesional elegido debe atender ese servicio (mismo check que
  //    /api/appointments — RLS de service_professionals filtra por tenant, AR14).
  const { data: spRow, error: spError } = await supabase
    .from('service_professionals')
    .select('professional_id')
    .eq('service_id', service_id)
    .eq('professional_id', professional_id)
    .maybeSingle()

  if (spError) {
    console.error('[appointments/walk-in/POST] service_professionals check error:', spError)
    return Response.json({ error: 'Error al validar el profesional' }, { status: 500 })
  }
  if (!spRow) {
    return Response.json(
      { error: 'El profesional seleccionado no atiende ese servicio' },
      { status: 400 },
    )
  }

  // 6. Anti-duplicado (AC6): un mismo paciente no puede estar dos veces en la
  //    cola del mismo servicio hoy. RLS filtra por tenant (AR14).
  const startOfToday = startOfDay(new Date()).toISOString()
  const endOfToday = endOfDay(new Date()).toISOString()
  const { data: dupRow, error: dupError } = await supabase
    .from('appointments')
    .select('appointment_id')
    .eq('is_walk_in', true)
    .eq('status', 'confirmed')
    .eq('patient_id', patient_id)
    .eq('service_id', service_id)
    .gte('start_at', startOfToday)
    .lte('start_at', endOfToday)
    .maybeSingle()

  if (dupError) {
    console.error('[appointments/walk-in/POST] duplicate check error:', dupError)
    return Response.json({ error: 'Error al validar la cola' }, { status: 500 })
  }
  if (dupRow) {
    return Response.json({ error: 'already_in_queue' }, { status: 409 })
  }

  // 7. Insert con reintento ante 23505 (índice anti-overbooking por profesional).
  //    start_at = ahora (hora de llegada); cada reintento lo desplaza +Nms para
  //    esquivar la colisión de instante exacto sin cambiar el orden de la cola.
  let inserted: { appointment_id: string } | null = null
  let lastError: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
    const startAt = new Date(Date.now() + attempt)
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        patient_id,
        service_id,
        professional_id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'confirmed',
        booked_via: 'manual',
        is_walk_in: true,
      })
      .select('appointment_id')
      .single()

    if (!error) {
      inserted = data
      break
    }

    lastError = error
    // Solo el conflicto de instante exacto se reintenta; cualquier otro error corta.
    if (error.code !== '23505') {
      console.error('[appointments/walk-in/POST] insert error:', error)
      return Response.json({ error: 'Error al registrar la llegada' }, { status: 500 })
    }
  }

  if (!inserted) {
    console.error('[appointments/walk-in/POST] insert conflict tras reintentos:', lastError)
    return Response.json({ error: 'slot_conflict' }, { status: 409 })
  }

  // 8. Audit
  await logAudit({
    action: 'walk_in_registered',
    entity_type: 'appointment',
    entity_id: inserted.appointment_id,
    supabase,
  })

  return Response.json({ success: true, appointment_id: inserted.appointment_id }, { status: 201 })
}

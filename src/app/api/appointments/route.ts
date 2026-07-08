import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { newAppointmentApiSchema } from '@/lib/schemas/appointment.schema'

export async function POST(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = newAppointmentApiSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { patient_id, service_id, professional_id, appointment_time, duration_minutes } = parsed.data

  // Calcular start_at y end_at — DB usa start_at/end_at (NOT NULL)
  const startAt = new Date(appointment_time)
  if (isNaN(startAt.getTime())) {
    return Response.json({ error: 'appointment_time inválido' }, { status: 400 })
  }
  const endAt = new Date(startAt.getTime() + duration_minutes * 60 * 1000)

  // 3. Validar que el profesional elegido atiende ese servicio.
  //    RLS de service_professionals filtra por tenant via JOIN a professionals,
  //    así que esta consulta sólo ve filas del tenant del usuario (AR14).
  const { data: spRow, error: spError } = await supabase
    .from('service_professionals')
    .select('professional_id')
    .eq('service_id', service_id)
    .eq('professional_id', professional_id)
    .maybeSingle()

  if (spError) {
    console.error('[appointments/POST] service_professionals check error:', spError)
    return Response.json({ error: 'Error al validar el profesional' }, { status: 500 })
  }
  if (!spRow) {
    return Response.json(
      { error: 'El profesional seleccionado no atiende ese servicio' },
      { status: 400 },
    )
  }

  // 4. Insertar turno
  const { data: inserted, error: insertError } = await supabase
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      patient_id,
      service_id,
      professional_id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      calendar_event_id: null,
      status: 'confirmed',
      booked_via: 'manual',
    })
    .select('appointment_id')
    .single()

  if (insertError) {
    // Código 23505 = unique_violation — conflicto de slot
    if (insertError.code === '23505') {
      return Response.json({ error: 'slot_conflict' }, { status: 409 })
    }
    console.error('[appointments/POST] insert error:', insertError)
    return Response.json({ error: 'Error al crear el turno' }, { status: 500 })
  }

  // 4. Audit log
  await logAudit({
    action: 'appointment_created',
    entity_type: 'appointment',
    entity_id: inserted.appointment_id,
    supabase,
  })

  return Response.json({ success: true, appointment_id: inserted.appointment_id }, { status: 201 })
}

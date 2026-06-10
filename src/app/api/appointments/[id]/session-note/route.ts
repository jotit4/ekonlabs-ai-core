import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { sessionNoteInputSchema } from '@/lib/schemas/session-note.schema'

// GET/PUT /api/appointments/[id]/session-note — Evolución por sesión ligada al turno (Story 14.3).
//
// HCE (Ley 25.326 — datos de salud): SOLO roles 'admin' y 'doctor'. receptionist → 403.
// Guard de rol = patrón clinical-notes / treatments/[id]/plan (NO el de PATCH
// /api/appointments/[id] ni POST /api/treatments, que son agendamiento con
// receptionist — copiarlos acá sería un bug de privacidad).
//
// La evolución se ancla al APPOINTMENT (no al treatment): `session_notes.appointment_id`
// es NOT NULL + UNIQUE (migración 041) → upsert ON CONFLICT (appointment_id).
// `treatment_id` se deriva de `appointments.package_id` en el server (NULL en turno
// suelto — el turno sin paquete TAMBIÉN evoluciona, AC del epic). `patient_id` se
// deriva de la fila appointments; si es null (turno del agente sin paciente) → 422.
//
// AR14: queries autenticadas SIN .eq('tenant_id', ...) — la RLS de la migración 041 filtra
// (incluir tenant_id en el payload del upsert SÍ corresponde: columna NOT NULL + WITH CHECK).
// AR15: sin admin.ts. AR10: API Route, no Server Action.
//
// ⚠️ DEPENDENCIA DE RUNTIME: requiere la migración 041 (session_notes) APLICADA.
// Aún NO está aplicada en prod — la aplica el usuario en EasyPanel. Si la tabla no existe,
// las queries devuelven error → 500 (el frontend degrada con mensaje no rompiente).

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROLES = ['admin', 'doctor']

// Validar formato UUID antes de cualquier query (B-11 — patrón hermano appointments/[id])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params

  // 0. UUID válido antes de tocar la DB
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'ID de turno inválido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rol clínico — SOLO admin/doctor (receptionist NO accede a HCE)
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. El turno debe existir y ser visible por RLS (otro tenant → null → 404)
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('appointment_id')
    .eq('appointment_id', id)
    .maybeSingle()

  if (appointmentError) {
    console.error('[appointments/session-note/GET] appointments query error:', appointmentError)
    return Response.json({ error: 'Error al obtener el turno' }, { status: 500 })
  }
  if (!appointment) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // 4. Evolución (null = aún no creada; se crea con el primer guardado)
  const { data: note, error: noteError } = await supabase
    .from('session_notes')
    .select('*')
    .eq('appointment_id', id)
    .maybeSingle()

  if (noteError) {
    console.error('[appointments/session-note/GET] session_notes query error:', noteError)
    return Response.json({ error: 'Error al obtener la evolución' }, { status: 500 })
  }

  return Response.json({ note: note ?? null }, { status: 200 })
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params

  // 0. UUID válido antes de tocar la DB
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'ID de turno inválido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rol clínico — SOLO admin/doctor
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // tenant_id SIEMPRE del JWT, nunca del body (AR-tenant)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Body — strictObject rechaza appointment_id/treatment_id/tenant_id/patient_id/author_id
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = sessionNoteInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Turno (RLS) → 404 + fuente del patient_id y package_id REALES (NUNCA del body)
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('appointment_id, patient_id, package_id')
    .eq('appointment_id', id)
    .maybeSingle()

  if (appointmentError) {
    console.error('[appointments/session-note/PUT] appointments query error:', appointmentError)
    return Response.json({ error: 'Error al obtener el turno' }, { status: 500 })
  }
  if (!appointment) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // 5. session_notes.patient_id es NOT NULL (041) pero appointments.patient_id es
  //    nullable (turnos creados por el agente sin paciente vinculado) → 422 accionable
  //    ANTES del insert, en vez de un 500 opaco por constraint violation.
  if (!appointment.patient_id) {
    return Response.json(
      {
        error:
          'El turno no tiene un paciente asociado. Vinculá el paciente antes de registrar la evolución.',
      },
      { status: 422 },
    )
  }

  // 6. Upsert — UNIQUE(appointment_id) de la migración 041 habilita ON CONFLICT.
  //    treatment_id = package_id de la fila appointments (NULL en turno suelto).
  //    author_id = último editor (la trazabilidad histórica la da el audit log).
  //    updated_at lo mantiene el trigger trg_session_notes_updated_at.
  const { data: note, error: upsertError } = await supabase
    .from('session_notes')
    .upsert(
      {
        tenant_id: tenantId,
        appointment_id: id,
        treatment_id: appointment.package_id ?? null,
        patient_id: appointment.patient_id,
        worked_on: parsed.data.worked_on,
        progress: parsed.data.progress,
        author_id: user.id,
      },
      { onConflict: 'appointment_id' },
    )
    .select()
    .single()

  if (upsertError || !note) {
    console.error('[appointments/session-note/PUT] upsert error:', upsertError)
    return Response.json({ error: 'Error al guardar la evolución' }, { status: 500 })
  }

  // 7. Audit — DESPUÉS del write exitoso (con autosave, cada guardado audita —
  //    mismo precedente que el autosave de clinical_notes).
  await logAudit({
    action: 'session_note_updated',
    entity_type: 'appointment',
    entity_id: id,
    supabase,
  })

  return Response.json({ note }, { status: 200 })
}

import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { sessionNoteInputSchema } from '@/lib/schemas/session-note.schema'

// GET/PUT /api/appointments/[id]/session-note — Evolución por sesión ligada al turno (Story 14.3).
//
// HCE (Ley 25.326 — datos de salud): roles 'admin', 'doctor' y 'receptionist' (ISADI:
// recepción hace la carga administrativa completa de la ficha clínica).
// Guard de rol = patrón clinical-notes / treatments/[id]/plan.
//
// La evolución se ancla al APPOINTMENT (no al treatment): `session_notes.appointment_id`
// es NOT NULL + UNIQUE (migración 041) → upsert ON CONFLICT (appointment_id).
// `treatment_id` se deriva de `appointments.package_id` en el server (NULL en turno
// suelto — el turno sin paquete TAMBIÉN evoluciona, AC del epic). `patient_id` se
// deriva de la fila appointments; si es null (turno del agente sin paciente) → 422.
//
// AR14: queries autenticadas SIN .eq('tenant_id', ...) — la RLS de la migración 041 filtra
// (incluir tenant_id en el payload del upsert SÍ corresponde: columna NOT NULL + WITH CHECK).
// AR15: admin.ts SOLO server-side (API Route) — NUNCA desde componentes/hooks. Se usa acá
// (resolveAuthorName) para resolver la firma cuando el autor es OTRO usuario del tenant
// (RLS de dashboard_users no lo permitiría con el cliente autenticado). AR10: API Route,
// no Server Action.
//
// ⚠️ DEPENDENCIA DE RUNTIME: requiere la migración 041 (session_notes) APLICADA.
// Aún NO está aplicada en prod — la aplica el usuario en EasyPanel. Si la tabla no existe,
// las queries devuelven error → 500 (el frontend degrada con mensaje no rompiente).

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROLES = ['admin', 'doctor', 'receptionist']

// Validar formato UUID antes de cualquier query (B-11 — patrón hermano appointments/[id])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Firma de la evolución (Fase 2): resuelve author_id → dashboard_users.full_name.
// author_id puede ser OTRO usuario del tenant que el que está pidiendo la nota
// (p.ej. recepción cargó, doctor la revisa) — dashboard_users solo tiene RLS SELECT
// para la fila propia o para admin, así que un doctor/receptionist mirando la firma de
// otro usuario NO vería nada con el cliente autenticado. Se resuelve con service role +
// tenant_id explícito (mismo patrón que profesionales/route.ts). Autor no encontrado,
// author_id null o falta el tenant_id → null (la UI muestra guion/nada).
async function resolveAuthorName(
  authorId: string | null | undefined,
  tenantId: string | undefined,
): Promise<string | null> {
  if (!authorId || !tenantId) return null

  const supabaseAdmin = createServiceRoleClient()
  const { data, error } = await supabaseAdmin
    .from('dashboard_users')
    .select('full_name')
    .eq('user_id', authorId)
    .eq('tenant_id', tenantId) // service_role bypasea RLS → filtro de tenant explícito
    .maybeSingle()

  if (error) {
    console.error('[appointments/session-note] dashboard_users lookup error:', error)
    return null
  }

  return data?.full_name || null
}

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

  // 2. Rol clínico — admin/doctor/receptionist
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

  // 5. Firma — nombre de quien guardó/editó último la evolución (Fase 2).
  const authorName = await resolveAuthorName(note?.author_id, claims?.tenant_id as string | undefined)

  return Response.json({ note: note ?? null, author_name: authorName }, { status: 200 })
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

  // 2. Rol clínico — admin/doctor/receptionist
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

  // 8. Firma — quien acaba de guardar es siempre `user.id` (author_id del upsert).
  const authorName = await resolveAuthorName(user.id, tenantId)

  return Response.json({ note, author_name: authorName }, { status: 200 })
}

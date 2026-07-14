import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { rescheduleApiSchema } from '@/lib/schemas/reschedule.schema'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // params es Promise en Next.js 16 — siempre await
  const { id } = await params

  // 0. Validar formato UUID antes de cualquier query (B-11)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'ID de turno inválido' }, { status: 400 })
  }

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

  const parsed = rescheduleApiSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { start_at, end_at, professional_id } = parsed.data

  // Validar que start_at < end_at
  if (new Date(start_at) >= new Date(end_at)) {
    return Response.json({ error: 'start_at debe ser anterior a end_at' }, { status: 400 })
  }

  // 2.5 — Story 13.4 (corrección Medium): si se reasigna el profesional, validar que
  // el NUEVO profesional ATIENDE el servicio del turno (service_professionals).
  // Mismo patrón que la RPC create_appointment (029) y la story 13.2: consulta
  // service_professionals por (service_id, professional_id) SIN .eq('tenant_id')
  // porque la RLS filtra por tenant vía el JOIN a professionals (AR14).
  // El candado 029 valida ocupación, NO idoneidad — esta validación cierra el hueco
  // que permitía mover, p.ej., un turno de Kinesiología a un profesional que solo da Pilates.
  if (professional_id !== undefined) {
    // Leer el service_id del turno (UPDATE parcial no lo toca; sólo lo necesitamos
    // para validar idoneidad). RLS de appointments filtra por tenant (AR14).
    const { data: apt, error: aptError } = await supabase
      .from('appointments')
      .select('service_id')
      .eq('appointment_id', id)
      .maybeSingle()

    if (aptError) {
      console.error('[appointments/PATCH] error leyendo turno:', aptError)
      return Response.json({ error: 'Error al reprogramar el turno' }, { status: 500 })
    }
    if (!apt) {
      return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
    }

    const { data: match, error: spError } = await supabase
      .from('service_professionals')
      .select('professional_id')
      .eq('service_id', apt.service_id)
      .eq('professional_id', professional_id)
      .maybeSingle()

    if (spError) {
      console.error('[appointments/PATCH] error validando service_professionals:', spError)
      return Response.json({ error: 'Error al reprogramar el turno' }, { status: 500 })
    }
    if (!match) {
      return Response.json({ error: 'professional_service_mismatch' }, { status: 400 })
    }
  }

  // 3. Actualizar turno (UPDATE PARCIAL)
  // Solo se escriben las columnas presentes en el body. `package_id`/`session_index`
  // y la tabla `treatments` NO se tocan → el vínculo con la serie y `sessions_remaining`
  // se preservan por construcción (Story 13.4, AC1/AC2). Mover ≠ consumir.
  // NO agregar .eq('tenant_id', tenantId) — RLS con cliente autenticado lo filtra (AR14)
  const updatePayload: { start_at: string; end_at: string; professional_id?: string } = {
    start_at,
    end_at,
    // status: NO cambiar a 'rescheduled' — el CHECK constraint de la DB solo acepta
    // 'confirmed','cancelled','completed','no_show'. El tipo TS 'rescheduled' es solo para display.
  }
  // Story 13.4 — solo incluir professional_id cuando viene en el body (opcional).
  // El candado por profesional (índice 029) valida la ocupación del NUEVO profesional
  // en el slot → 23505 → 409 slot_conflict (manejado abajo). No se agrega validación nueva.
  if (professional_id !== undefined) {
    updatePayload.professional_id = professional_id
  }

  const { error: updateError, count } = await supabase
    .from('appointments')
    .update(updatePayload, { count: 'exact' })
    .eq('appointment_id', id)

  if (updateError) {
    // Código 23505 = unique_violation — conflicto de slot
    if (updateError.code === '23505') {
      return Response.json({ error: 'slot_conflict' }, { status: 409 })
    }
    console.error('[appointments/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al reprogramar el turno' }, { status: 500 })
  }

  // Verificar que se actualizó al menos una fila (fix C-15)
  if (count === 0) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // 4. Audit log
  await logAudit({
    action: 'appointment_rescheduled',
    entity_type: 'appointment',
    entity_id: id,
    supabase,
  })

  return Response.json({ success: true }, { status: 200 })
}

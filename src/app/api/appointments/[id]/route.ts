import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { rescheduleApiSchema } from '@/lib/schemas/reschedule.schema'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // params es Promise en Next.js 16 — siempre await
  const { id } = await params

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  const { start_at, end_at } = parsed.data

  // Validar que start_at < end_at
  if (new Date(start_at) >= new Date(end_at)) {
    return Response.json({ error: 'start_at debe ser anterior a end_at' }, { status: 400 })
  }

  // 3. Actualizar turno
  // NO agregar .eq('tenant_id', tenantId) — RLS con cliente autenticado lo filtra (AR14)
  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      start_at,
      end_at,
      // status: NO cambiar a 'rescheduled' — el CHECK constraint de la DB solo acepta
      // 'confirmed','cancelled','completed','no_show'. El tipo TS 'rescheduled' es solo para display.
    })
    .eq('appointment_id', id)

  if (updateError) {
    // Código 23505 = unique_violation — conflicto de slot
    if (updateError.code === '23505') {
      return Response.json({ error: 'slot_conflict' }, { status: 409 })
    }
    console.error('[appointments/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al reprogramar el turno' }, { status: 500 })
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

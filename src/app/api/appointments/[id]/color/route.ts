import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { appointmentColorApiSchema } from '@/lib/schemas/appointment.schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/appointments/[id]/color — cambia (o limpia) el color MANUAL del
// turno (migración 051, paleta muda del turnero — pedido ISADI 2026-07-14).
// Endpoint dedicado, mismo patrón que /[id]/status: el color es un concepto
// independiente del estado/reprogramación (no requiere start_at/end_at).
// `color: null` limpia el color manual (el turno vuelve a verse neutro).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // params es Promise en Next.js 16 — siempre await
  const { id } = await params

  // 0. Validar formato UUID antes de cualquier query
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

  const parsed = appointmentColorApiSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { color } = parsed.data

  // 3. Actualizar turno — UPDATE PARCIAL, solo la columna color.
  // NO agregar .eq('tenant_id', tenantId) — RLS con cliente autenticado lo filtra (AR14)
  const { error: updateError, count } = await supabase
    .from('appointments')
    .update({ color }, { count: 'exact' })
    .eq('appointment_id', id)

  if (updateError) {
    console.error('[appointments/[id]/color/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al actualizar el color del turno' }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // 4. Audit log
  await logAudit({
    action: 'appointment_color_changed',
    entity_type: 'appointment',
    entity_id: id,
    supabase,
  })

  return Response.json({ success: true }, { status: 200 })
}

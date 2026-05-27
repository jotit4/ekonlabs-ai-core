import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_STATUSES = ['cancelled', 'completed', 'no_show'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return ALLOWED_STATUSES.includes(value as AllowedStatus)
}

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

  const status = (body as Record<string, unknown>)?.status
  if (!isAllowedStatus(status)) {
    return Response.json(
      { error: 'status debe ser "cancelled", "completed" o "no_show"' },
      { status: 400 }
    )
  }

  // 3. Actualizar turno
  // NO agregar .eq('tenant_id', tenantId) — RLS con cliente autenticado lo filtra (AR14)
  const { error: updateError, count } = await supabase
    .from('appointments')
    .update({ status }, { count: 'exact' })
    .eq('appointment_id', id)

  if (updateError) {
    console.error('[appointments/[id]/status/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al actualizar el estado del turno' }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // 4. Audit log
  const auditAction =
    status === 'cancelled'
      ? 'appointment_cancelled'
      : status === 'completed'
        ? 'appointment_completed'
        : 'appointment_no_show'

  await logAudit({
    action: auditAction,
    entity_type: 'appointment',
    entity_id: id,
    supabase,
  })

  return Response.json({ success: true }, { status: 200 })
}

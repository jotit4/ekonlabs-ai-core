import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'

// POST /api/conversaciones/[phone]/resolve
// Body: { resolved: boolean }
// Upsert en conversation_resolutions.
// resolved=true  → resolved_at = now  (marcar como resuelta)
// resolved=false → resolved_at = null (reabrir)
// RLS: SELECT/INSERT/UPDATE por tenant.

export async function POST(
  request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

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

  let body: { resolved?: unknown }
  try {
    body = await request.json() as { resolved?: unknown }
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (typeof body.resolved !== 'boolean') {
    return Response.json({ error: '"resolved" debe ser boolean' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const resolvedAt = body.resolved ? now : null
  const resolvedByUser = body.resolved ? user.id : null
  const resolvedByName = body.resolved
    ? ((claims?.name ?? claims?.full_name ?? null) as string | null)
    : null

  const { error } = await supabase
    .from('conversation_resolutions')
    .upsert(
      {
        tenant_id: tenantId,
        phone_number: phone,
        resolved_at: resolvedAt,
        resolved_by_user: resolvedByUser,
        resolved_by_name: resolvedByName,
        updated_at: now,
      },
      { onConflict: 'tenant_id,phone_number' }
    )

  if (error) {
    console.error('[resolve/POST] upsert error:', error)
    return Response.json({ error: 'Error al actualizar resolución' }, { status: 500 })
  }

  return Response.json({ status: 'ok' })
}

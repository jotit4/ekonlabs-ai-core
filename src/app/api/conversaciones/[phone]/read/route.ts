import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'

// POST /api/conversaciones/[phone]/read
// Marca una conversación como leída por el usuario actual.
// Upsert en conversation_reads (tenant_id, user_id, phone_number, last_read_at).
// RLS: el usuario solo puede escribir SUS propias filas (user_id = auth.uid()).

export async function POST(
  _request: Request,
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

  const { error } = await supabase
    .from('conversation_reads')
    .upsert(
      {
        tenant_id: tenantId,
        user_id: user.id,
        phone_number: phone,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id,phone_number' }
    )

  if (error) {
    console.error('[read/POST] upsert error:', error)
    return Response.json({ error: 'Error al marcar como leída' }, { status: 500 })
  }

  return Response.json({ status: 'ok' })
}

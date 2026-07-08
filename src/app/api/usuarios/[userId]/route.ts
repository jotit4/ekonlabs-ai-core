import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  // params es Promise en Next.js 16 — siempre await
  const { userId } = await params

  // 1. Validar sesión y rol
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  if ((claims?.app_role ?? claims?.role) !== 'admin') {
    return Response.json({ error: 'Solo admins pueden modificar usuarios' }, { status: 403 })
  }

  // 2. Validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { is_active } = body as { is_active?: unknown }

  if (typeof is_active !== 'boolean') {
    return Response.json({ error: 'is_active debe ser boolean' }, { status: 400 })
  }

  // 3. Actualizar con cliente autenticado — RLS garantiza solo usuarios del mismo tenant
  const { data, error } = await supabase
    .from('dashboard_users')
    .update({ is_active })
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    return Response.json({ error: 'Usuario no encontrado o sin permiso' }, { status: 404 })
  }

  // 4. Audit log
  await logAudit({
    action: is_active ? 'user_activated' : 'user_deactivated',
    entity_type: 'user',
    entity_id: userId,
    supabase,
  })

  return Response.json({ success: true, user: data })
}

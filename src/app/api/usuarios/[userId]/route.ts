import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { updateUserSchema } from '@/lib/schemas/users'

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

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }
  const { is_active, attention_mode } = parsed.data

  // Solo se mandan a la DB los campos presentes: un PATCH que cambia el subtipo
  // no debe tocar is_active (ni al revés).
  const patch: { is_active?: boolean; attention_mode?: string | null } = {}
  if (is_active !== undefined) patch.is_active = is_active
  if (attention_mode !== undefined) patch.attention_mode = attention_mode

  // Cambiar el subtipo solo tiene sentido si el usuario atiende: sin
  // professional_id, 'walk_in' no puede resolver "su día" y la landing caería a
  // la del rol — un estado configurado que no hace nada.
  if (patch.attention_mode) {
    const { data: target } = await supabase
      .from('dashboard_users')
      .select('professional_id')
      .eq('user_id', userId)
      .single()
    if (!target?.professional_id) {
      return Response.json(
        { error: 'Ese usuario no está vinculado a un profesional: no puede tener tipo de atención' },
        { status: 400 },
      )
    }
  }

  // 3. Actualizar con cliente autenticado — RLS garantiza solo usuarios del mismo tenant
  const { data, error } = await supabase
    .from('dashboard_users')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    return Response.json({ error: 'Usuario no encontrado o sin permiso' }, { status: 404 })
  }

  // 4. Audit log — el alta/baja es el evento relevante; si el PATCH solo cambió
  // el subtipo se registra como actualización.
  await logAudit({
    action: is_active === undefined ? 'user_updated' : is_active ? 'user_activated' : 'user_deactivated',
    entity_type: 'user',
    entity_id: userId,
    supabase,
  })

  return Response.json({ success: true, user: data })
}

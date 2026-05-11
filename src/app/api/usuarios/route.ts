import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { createUserSchema } from '@/lib/schemas/users'

export async function POST(request: Request) {
  // 1. Validar sesión y rol del llamante
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  if (claims?.role !== 'admin') {
    return Response.json({ error: 'Solo admins pueden crear usuarios' }, { status: 403 })
  }

  const tenantId = claims.tenant_id as string
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

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { email, full_name, role } = parsed.data

  // 3. Invitar usuario con service role (Admin API)
  const supabaseAdmin = createServiceRoleClient()
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    const isDuplicate =
      inviteError.message?.toLowerCase().includes('already') ||
      inviteError.message?.toLowerCase().includes('exists')
    if (isDuplicate) {
      return Response.json(
        { error: 'Ya existe un usuario con ese email en esta organización' },
        { status: 409 }
      )
    }
    console.error('[usuarios/POST] inviteUserByEmail error:', inviteError)
    return Response.json({ error: 'Error al invitar usuario' }, { status: 500 })
  }

  const invitedUserId = inviteData.user.id

  // 4. Insertar en dashboard_users con service role (bypasea RLS — tenant_id obligatorio)
  const { data: insertedUser, error: insertError } = await supabaseAdmin
    .from('dashboard_users')
    .insert({
      user_id: invitedUserId,
      tenant_id: tenantId,
      role,
      full_name,
      email,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) {
    // Si el insert falla, eliminar el usuario de auth para no dejar huérfano
    await supabaseAdmin.auth.admin.deleteUser(invitedUserId)
    console.error('[usuarios/POST] insert error:', insertError)
    return Response.json({ error: 'Error al registrar usuario' }, { status: 500 })
  }

  // 5. Audit log con cliente autenticado del admin
  await logAudit({
    action: 'user_created',
    entity_type: 'user',
    entity_id: invitedUserId,
    supabase,
  })

  return Response.json({ success: true, user: insertedUser }, { status: 201 })
}

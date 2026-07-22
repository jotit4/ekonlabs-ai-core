import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { createUserSchema } from '@/lib/schemas/users'

export async function GET() {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json({ error: 'Solo admins pueden listar usuarios' }, { status: 403 })
  }

  // 3. Listar usuarios del tenant — RLS filtra por tenant_id (AR14)
  const { data: users, error: queryError } = await supabase
    .from('dashboard_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (queryError) {
    console.error('[usuarios/GET] query error:', queryError)
    return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }

  return Response.json({ users: users ?? [] })
}

export async function POST(request: Request) {
  // 1. Validar sesión y rol del llamante
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  if (!claims || (claims.app_role ?? claims.role) !== 'admin') {
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

  const { email, full_name, role, professional_id, attention_mode } = parsed.data

  // El profesional a vincular tiene que ser del MISMO tenant y estar activo. Se
  // valida con el cliente autenticado (RLS filtra por tenant) ANTES de invitar:
  // si no, un professional_id ajeno crearía el usuario de auth y recién fallaría
  // al insertar, dejando basura que limpiar.
  if (professional_id) {
    const { data: prof } = await supabase
      .from('professionals')
      .select('professional_id, active')
      .eq('professional_id', professional_id)
      .single()
    if (!prof) {
      return Response.json({ error: 'El profesional seleccionado no existe' }, { status: 400 })
    }
    if (!prof.active) {
      return Response.json({ error: 'El profesional seleccionado está inactivo' }, { status: 400 })
    }

    // Un profesional no puede quedar vinculado a dos usuarios: "su día" y "Mi
    // agenda" resuelven por professional_id, así que el vínculo duplicado haría
    // que dos cuentas compartan la misma agenda.
    const { data: taken } = await supabase
      .from('dashboard_users')
      .select('email')
      .eq('professional_id', professional_id)
      .maybeSingle()
    if (taken) {
      return Response.json(
        { error: `Ese profesional ya está vinculado al usuario ${taken.email}` },
        { status: 409 },
      )
    }
  }

  // 3. Invitar usuario con service role (Admin API)
  const supabaseAdmin = createServiceRoleClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/`,
  })

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
      // Vínculo con el profesional + subtipo de atención (056). Determinan la
      // navegación por defecto del usuario: 'walk_in' entra a su día en el
      // Calendario, 'appointment' a la landing de su rol.
      professional_id: professional_id ?? null,
      attention_mode: attention_mode ?? null,
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

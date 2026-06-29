import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { CreateProfessionalUserSchema } from '@/lib/schemas/profesionales.schema'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: professionalId } = await params

  // 1. Autenticación
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin o receptionist
  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json(
      { error: 'Solo admin o receptionist pueden crear cuentas de usuario' },
      { status: 403 }
    )
  }

  const tenantId = claims?.tenant_id as string
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = CreateProfessionalUserSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { email } = parsed.data

  // 4. Verificar que el profesional existe y pertenece al tenant
  // RLS filtra automáticamente por tenant_id — no agregar .eq('tenant_id', ...) (AR14)
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('professional_id, name, email')
    .eq('professional_id', professionalId)
    .single()

  if (profError || !professional) {
    return Response.json({ error: 'Profesional no encontrado' }, { status: 404 })
  }

  // 5. Verificar que el profesional NO tiene ya un usuario vinculado
  // Usamos service role para buscar en dashboard_users sin restricción de RLS
  const supabaseAdmin = createServiceRoleClient()

  const { data: existingLink } = await supabaseAdmin
    .from('dashboard_users')
    .select('user_id, email')
    .eq('professional_id', professionalId)
    .eq('tenant_id', tenantId) // service_role bypasea RLS → filtro de tenant explícito (defensa en profundidad)
    .single()

  if (existingLink) {
    return Response.json(
      { error: 'Este profesional ya tiene una cuenta de usuario vinculada', existing_email: existingLink.email },
      { status: 409 }
    )
  }

  // 6. Invitar usuario via Supabase Auth Admin API
  // inviteUserByEmail envía el email de invitación al profesional para que establezca su contraseña
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${appUrl}/`,
    }
  )

  if (inviteError) {
    const isDuplicate =
      inviteError.message?.toLowerCase().includes('already') ||
      inviteError.message?.toLowerCase().includes('exists')
    if (isDuplicate) {
      return Response.json(
        { error: 'Ya existe un usuario con ese email' },
        { status: 409 }
      )
    }
    console.error('[profesionales/[id]/usuario/POST] inviteUserByEmail error:', inviteError)
    return Response.json({ error: 'Error al invitar usuario' }, { status: 500 })
  }

  const invitedUserId = inviteData.user.id

  // 7. Insertar en dashboard_users con service role (bypasea RLS — tenant_id obligatorio)
  const { data: insertedUser, error: insertError } = await supabaseAdmin
    .from('dashboard_users')
    .insert({
      user_id: invitedUserId,
      tenant_id: tenantId,
      role: 'doctor',  // Hardcodeado — un profesional siempre recibe rol doctor
      full_name: professional.name,
      email,
      professional_id: professionalId,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) {
    // Rollback: eliminar el usuario invitado para no dejar huérfano en auth
    await supabaseAdmin.auth.admin.deleteUser(invitedUserId)
    console.error('[profesionales/[id]/usuario/POST] insert error:', insertError)
    return Response.json({ error: 'Error al registrar usuario' }, { status: 500 })
  }

  // 8. Audit log con cliente autenticado del admin/receptionist
  await logAudit({
    action: 'user_created',
    entity_type: 'user',
    entity_id: invitedUserId,
    supabase,
  })

  // Silence unused variable warning
  void insertedUser

  return Response.json(
    {
      data: {
        user_id: invitedUserId,
        email,
        full_name: professional.name,
      },
    },
    { status: 201 }
  )
}

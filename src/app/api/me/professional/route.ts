import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { UpdateMyProfessionalSchema } from '@/lib/schemas/mi-perfil.schema'

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Verificar rol — solo doctor puede acceder
  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  if (claims?.app_role !== 'doctor') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. Obtener professional_id + datos profesionales desde dashboard_users
  // NO usar .eq('tenant_id', ...) — RLS filtra automáticamente (AR14)
  const { data: dashboardUser, error: dbError } = await supabase
    .from('dashboard_users')
    .select('professional_id, professionals(name, email)')
    .eq('user_id', user.id)
    .single()

  if (dbError) {
    console.error('[api/me/professional/GET] error:', dbError)
    return Response.json({ error: 'Error al obtener el perfil' }, { status: 500 })
  }

  if (!dashboardUser?.professional_id) {
    return Response.json({ error: 'Profesional no asignado' }, { status: 404 })
  }

  const professionals = dashboardUser.professionals as unknown as
    | { name: string; email: string | null }
    | null

  // 4. Servicios que ofrece (Story 10.8) — SOLO LECTURA.
  // Viven en service_professionals (PK service_id + professional_id) + JOIN a services.name.
  // RLS service_professionals_select_own permite SELECT del tenant.
  const { data: spRows } = await supabase
    .from('service_professionals')
    .select('service_id, services(name)')
    .eq('professional_id', dashboardUser.professional_id)

  const services = (spRows ?? []).map((row) => {
    const svc = row.services as unknown as { name: string } | null
    return {
      service_id: row.service_id as string,
      name: svc?.name ?? '',
    }
  })

  return Response.json({
    data: {
      professional_id: dashboardUser.professional_id,
      professional_name: professionals?.name ?? '',
      professional_email: professionals?.email ?? '',
      services,
    },
  }, { status: 200 })
}

export async function PATCH(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Verificar rol — solo doctor edita su propio perfil profesional desde acá
  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  if (claims?.app_role !== 'doctor') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. Parsear y validar body (solo name/email — NO servicios)
  const body = await request.json().catch(() => null)
  const parsed = UpdateMyProfessionalSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Obtener professional_id propio
  const { data: du, error: duErr } = await supabase
    .from('dashboard_users')
    .select('professional_id')
    .eq('user_id', user.id)
    .single()

  if (duErr) {
    console.error('[api/me/professional/PATCH] error:', duErr)
    return Response.json({ error: 'Error al obtener el perfil' }, { status: 500 })
  }

  if (!du?.professional_id) {
    return Response.json({ error: 'Profesional no asignado' }, { status: 404 })
  }

  // 5. UPDATE — RLS professionals_update_doctor_own restringe a la fila propia (AR14).
  // .eq('professional_id', ...) apunta a la fila propia; la policy garantiza
  // professional_id = current_professional_id(). Doble cinturón seguro.
  const { data, error } = await supabase
    .from('professionals')
    .update(parsed.data)
    .eq('professional_id', du.professional_id)
    .select('professional_id, name, email')
    .single()

  if (error) {
    if (error.code === '23505') {  // unique_violation (professionals_email_unique)
      return Response.json({ error: 'Ese email profesional ya está en uso' }, { status: 409 })
    }
    console.error('[api/me/professional/PATCH] error:', error)
    return Response.json({ error: 'Error al actualizar el perfil profesional' }, { status: 500 })
  }

  return Response.json({ data })
}

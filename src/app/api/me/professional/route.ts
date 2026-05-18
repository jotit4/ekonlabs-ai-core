import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'

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

  // 3. Obtener professional_id desde dashboard_users
  // NO usar .eq('tenant_id', ...) — RLS filtra automáticamente (AR14)
  const { data: dashboardUser, error: dbError } = await supabase
    .from('dashboard_users')
    .select('professional_id, professionals(name)')
    .eq('user_id', user.id)
    .single()

  if (dbError) {
    console.error('[api/me/professional/GET] error:', dbError)
    return Response.json({ error: 'Error al obtener el perfil' }, { status: 500 })
  }

  if (!dashboardUser?.professional_id) {
    return Response.json({ error: 'Profesional no asignado' }, { status: 404 })
  }

  const professionals = dashboardUser.professionals as unknown as { name: string } | null

  return Response.json({
    data: {
      professional_id: dashboardUser.professional_id,
      professional_name: professionals?.name ?? '',
    },
  }, { status: 200 })
}

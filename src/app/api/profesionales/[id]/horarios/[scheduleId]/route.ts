import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { authorizeProfessionalAccess } from '@/lib/utils/professional-access'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin/receptionist (sin restricción de id) o doctor sobre su propio professional_id
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role

  const { id, scheduleId } = await params

  const auth = await authorizeProfessionalAccess(supabase, role, user.id, id)
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 403 ? 'Acceso denegado' : 'Error al verificar acceso' },
      { status: auth.status }
    )
  }

  // 3. DELETE — RLS verifica tenant automáticamente (AR14)
  const { error, count } = await supabase
    .from('professional_schedules')
    .delete({ count: 'exact' })
    .eq('schedule_id', scheduleId)

  if (error) {
    // PGRST116: no rows found
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Horario no encontrado' }, { status: 404 })
    }
    return Response.json({ error: 'Error al eliminar el horario' }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Horario no encontrado' }, { status: 404 })
  }

  return new Response(null, { status: 204 })
}

import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { authorizeProfessionalAccess } from '@/lib/utils/professional-access'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; blockId: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin/receptionist (sin restricción de id) o doctor sobre su propio professional_id
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role

  const { id, blockId } = await params

  const auth = await authorizeProfessionalAccess(supabase, role, user.id, id)
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 403 ? 'Acceso denegado' : 'Error al verificar acceso' },
      { status: auth.status }
    )
  }

  // 3. DELETE — RLS verifica tenant automáticamente (AR14)
  const { error, count } = await supabase
    .from('blocked_times')
    .delete({ count: 'exact' })
    .eq('block_id', blockId)

  if (error) {
    // PGRST116: no rows found
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Bloqueo no encontrado' }, { status: 404 })
    }
    return Response.json({ error: 'Error al eliminar el bloqueo' }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Bloqueo no encontrado' }, { status: 404 })
  }

  return new Response(null, { status: 204 })
}

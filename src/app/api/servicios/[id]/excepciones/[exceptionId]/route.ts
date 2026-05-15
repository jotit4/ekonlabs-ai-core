import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; exceptionId: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json({ error: 'Solo administradores pueden gestionar excepciones' }, { status: 403 })
  }

  const { id, exceptionId } = await params

  // 3. DELETE por exception_id + service_id — RLS garantiza que solo el tenant puede borrar
  const { error } = await supabase
    .from('service_exceptions')
    .delete()
    .eq('exception_id', exceptionId)
    .eq('service_id', id)

  if (error) {
    return Response.json({ error: 'Error al eliminar la excepción' }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}

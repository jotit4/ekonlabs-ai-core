import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
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
    return Response.json(
      { error: 'Solo administradores pueden gestionar horarios de profesionales' },
      { status: 403 }
    )
  }

  const { scheduleId } = await params

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

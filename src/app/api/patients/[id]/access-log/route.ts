import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params

  if (!id) {
    return Response.json({ error: 'patient_id requerido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // NO validar rol — cualquier usuario autenticado puede acceder a fichas (FR17)
  await logAudit({
    action: 'patient_accessed',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json({ ok: true }, { status: 200 })
}

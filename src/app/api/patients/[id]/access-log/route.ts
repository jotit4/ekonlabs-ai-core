import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
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
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

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

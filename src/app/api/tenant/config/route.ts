import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // RLS filtra automáticamente por tenant — AR14
  const { data, error } = await supabase
    .from('tenants')
    .select('uses_native_calendar')
    .single()

  if (error || !data) {
    return Response.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }

  return Response.json({ uses_native_calendar: data.uses_native_calendar }, { status: 200 })
}

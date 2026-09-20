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
    .select('uses_native_calendar, rules')
    .single()

  if (error || !data) {
    return Response.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }

  // agenda_area_focus (tenants.rules) — ajuste ISADI: la agenda recorta a
  // servicios de rehabilitación SOLO para el tenant que lo configuró. Cualquier
  // otro valor (incluido ausente, string vacío, u otro tipo) equivale a "sin
  // foco" — el único valor válido es 'rehab'. Ver migración 062.
  const rules = data.rules as Record<string, unknown> | null
  const agendaAreaFocus = rules?.agenda_area_focus === 'rehab' ? 'rehab' : null

  return Response.json(
    { uses_native_calendar: data.uses_native_calendar, agenda_area_focus: agendaAreaFocus },
    { status: 200 },
  )
}

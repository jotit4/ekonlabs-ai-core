import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Resolver professional_id desde el VÍNCULO dashboard_users.user_id — NO por email.
  // El email de la ficha del profesional puede no coincidir con el email de login;
  // el vínculo user_id ↔ professional_id es la fuente de verdad (mismo patrón que /api/me/professional).
  // NO usar .eq('tenant_id', ...) — RLS filtra automáticamente (AR14).
  const { data: dashboardUser, error: profError } = await supabase
    .from('dashboard_users')
    .select('professional_id')
    .eq('user_id', user.id)
    .single()

  if (profError || !dashboardUser?.professional_id) {
    return Response.json(
      { error: 'Esta vista es solo para profesionales vinculados' },
      { status: 403 }
    )
  }

  // 3. Leer query param fecha (YYYY-MM-DD); si no viene → usar fecha actual en UTC
  const url = new URL(request.url)
  const fechaParam = url.searchParams.get('fecha')

  let isoDate: string
  if (fechaParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
      return Response.json({ error: 'Formato de fecha inválido. Usar YYYY-MM-DD' }, { status: 400 })
    }
    isoDate = fechaParam
  } else {
    isoDate = new Date().toISOString().slice(0, 10)
  }

  // 4. Construir rango de fecha
  const startISO = `${isoDate}T00:00:00.000Z`
  const nextDay = new Date(isoDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const endISO = nextDay.toISOString().slice(0, 10) + 'T00:00:00.000Z'

  // 5. Query appointments filtrados por professional_id
  // NO .eq('tenant_id', ...) — RLS filtra automáticamente (AR14)
  const { data: appointments, error: aptsError } = await supabase
    .from('appointments')
    .select('*, patients(full_name), services(name, duration_minutes)')
    .eq('professional_id', dashboardUser.professional_id)
    .gte('start_at', startISO)
    .lt('start_at', endISO)
    .order('start_at', { ascending: true })

  if (aptsError) {
    console.error('[appointments/mi-agenda/GET] error:', aptsError)
    return Response.json({ error: 'Error al obtener los turnos' }, { status: 500 })
  }

  return Response.json({ data: appointments ?? [] }, { status: 200 })
}

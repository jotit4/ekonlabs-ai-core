import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener professional_id via email — NO usar parseJwtPayload (professional_id no está en JWT)
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('professional_id')
    .eq('email', user.email!)
    .single()

  if (profError || !professional) {
    return Response.json(
      { error: 'Profesional no encontrado para este usuario' },
      { status: 404 }
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
    .eq('professional_id', professional.professional_id)
    .gte('start_at', startISO)
    .lt('start_at', endISO)
    .order('start_at', { ascending: true })

  if (aptsError) {
    console.error('[appointments/mi-agenda/GET] error:', aptsError)
    return Response.json({ error: 'Error al obtener los turnos' }, { status: 500 })
  }

  return Response.json({ data: appointments ?? [] }, { status: 200 })
}

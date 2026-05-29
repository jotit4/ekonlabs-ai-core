import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'

// GET /api/services/[id]/profesionales
// Devuelve los profesionales activos que atienden un servicio dado, vía
// service_professionals. Usado por NewTurnoModal para poblar el selector de
// profesional filtrado por el servicio elegido (modelo de disponibilidad por
// profesional — migración 029).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin o receptionist (igual que el resto de turnos/agenda)
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. id del path (params es Promise en Next.js 16)
  const { id: serviceId } = await params

  // 4. Query con RLS automático — service_professionals filtra por tenant via
  //    JOIN a professionals; no agregar .eq('tenant_id', ...) (AR14).
  const { data, error } = await supabase
    .from('service_professionals')
    .select(`
      professional_id,
      professionals ( professional_id, name, active )
    `)
    .eq('service_id', serviceId)

  if (error) {
    return Response.json({ error: 'Error al obtener profesionales del servicio' }, { status: 500 })
  }

  type ProfRow = { professional_id: string; name: string; active: boolean } | null

  const professionals = (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => row.professionals as ProfRow)
    .filter((p): p is { professional_id: string; name: string; active: boolean } =>
      p != null && p.active === true,
    )
    .map((p) => ({ professional_id: p.professional_id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return Response.json({ data: professionals })
}

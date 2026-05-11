import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntidadConPlanes {
  entidad: string
  planes: string[]
}

// ─── GET /api/obras-sociales ──────────────────────────────────────────────────

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('obras_sociales')
    .select('entidad, plan_nombre')
    .eq('activo', true)
    .order('entidad', { ascending: true })
    .order('plan_nombre', { ascending: true })

  if (error) {
    console.error('[obras-sociales/GET] error:', error)
    return Response.json({ error: 'Error al cargar obras sociales' }, { status: 500 })
  }

  // Agrupar por entidad
  const grouped = (data ?? []).reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.entidad]) acc[row.entidad] = []
    acc[row.entidad].push(row.plan_nombre)
    return acc
  }, {})

  const entidades: EntidadConPlanes[] = Object.entries(grouped).map(([entidad, planes]) => ({
    entidad,
    planes,
  }))

  return Response.json({ entidades }, {
    status: 200,
    headers: { 'Cache-Control': 'private, max-age=300' },
  })
}

import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { z } from 'zod'

const UpdateServicesSchema = z.object({
  service_ids: z.array(z.string().uuid()),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin o receptionist
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json(
      { error: 'Acceso denegado' },
      { status: 403 }
    )
  }

  // 3. Extraer id del path (params es Promise en Next.js 16)
  const { id } = await params

  // 4. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = UpdateServicesSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 5. DELETE de todas las asignaciones actuales
  const { error: deleteError } = await supabase
    .from('service_professionals')
    .delete()
    .eq('professional_id', id)

  if (deleteError) {
    return Response.json({ error: 'Error al actualizar servicios' }, { status: 500 })
  }

  // 6. Si hay nuevos service_ids, insertarlos
  if (parsed.data.service_ids.length > 0) {
    const rows = parsed.data.service_ids.map((service_id) => ({
      service_id,
      professional_id: id,
    }))

    const { error: insertError } = await supabase
      .from('service_professionals')
      .insert(rows)

    if (insertError) {
      return Response.json({ error: 'Error al asignar servicios' }, { status: 500 })
    }
  }

  return Response.json({
    data: {
      professional_id: id,
      service_ids: parsed.data.service_ids,
    },
  })
}

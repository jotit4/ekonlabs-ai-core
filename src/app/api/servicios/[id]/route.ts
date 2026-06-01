import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { UpdateServiceSchema } from '@/lib/schemas/servicios.schema'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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
      { error: 'Solo administradores pueden gestionar servicios' },
      { status: 403 }
    )
  }

  // 3. Extraer id del path
  const { id } = await params

  // 4. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = UpdateServiceSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 5. UPDATE con .eq('service_id', id) — RLS filtra por tenant automáticamente (AR14)
  const { data, error } = await supabase
    .from('services')
    .update(parsed.data)
    .eq('service_id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }
    return Response.json({ error: 'Error al actualizar el servicio' }, { status: 500 })
  }

  // 6. Audit log — tras UPDATE exitoso (AC5)
  await logAudit({
    action: 'config_service_updated',
    entity_type: 'config',
    entity_id: id,
    supabase,
  })

  return Response.json({ data })
}

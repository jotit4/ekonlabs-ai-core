import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { UpdateProfessionalSchema } from '@/lib/schemas/profesionales.schema'

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
  const parsed = UpdateProfessionalSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 5. UPDATE — RLS filtra por tenant automáticamente (AR14)
  const { data, error } = await supabase
    .from('professionals')
    .update(parsed.data)
    .eq('professional_id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Profesional no encontrado' }, { status: 404 })
    }
    return Response.json({ error: 'Error al actualizar el profesional' }, { status: 500 })
  }

  return Response.json({ data })
}

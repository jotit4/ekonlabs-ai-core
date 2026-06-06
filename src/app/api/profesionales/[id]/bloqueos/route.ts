import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { authorizeProfessionalAccess } from '@/lib/utils/professional-access'
import { CreateBlockedTimeSchema } from '@/lib/schemas/profesionales-horarios.schema'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin/receptionist (sin restricción de id) o doctor sobre su propio professional_id
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role

  const { id } = await params

  const auth = await authorizeProfessionalAccess(supabase, role, user.id, id)
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 403 ? 'Acceso denegado' : 'Error al verificar acceso' },
      { status: auth.status }
    )
  }

  // 3. Query con RLS aplicado automáticamente — NO agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('blocked_times')
    .select('block_id, professional_id, date_from, date_to, reason')
    .eq('professional_id', id)
    .order('date_from', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener bloqueos del profesional' }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin/receptionist (sin restricción de id) o doctor sobre su propio professional_id
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const role = claims?.app_role

  const { id } = await params

  const auth = await authorizeProfessionalAccess(supabase, role, user.id, id)
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 403 ? 'Acceso denegado' : 'Error al verificar acceso' },
      { status: auth.status }
    )
  }

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateBlockedTimeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. INSERT — NO incluir tenant_id (la tabla no tiene ese campo; AR14)
  const { data, error } = await supabase
    .from('blocked_times')
    .insert({
      professional_id: id,
      date_from: parsed.data.date_from,
      date_to: parsed.data.date_to,
      reason: parsed.data.reason ?? null,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'Error al crear el período bloqueado' }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}

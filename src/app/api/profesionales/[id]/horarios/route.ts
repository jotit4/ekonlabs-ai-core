import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { CreateProfessionalScheduleSchema } from '@/lib/schemas/profesionales-horarios.schema'

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

  const { id } = await params

  // 3. Query con RLS aplicado automáticamente — NO agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('professional_schedules')
    .select('schedule_id, professional_id, day_of_week, start_time, end_time')
    .eq('professional_id', id)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener horarios del profesional' }, { status: 500 })
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

  const { id } = await params

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateProfessionalScheduleSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Validación de solapamiento server-side — ANTES del INSERT
  const { data: existing, error: fetchError } = await supabase
    .from('professional_schedules')
    .select('start_time, end_time')
    .eq('professional_id', id)
    .eq('day_of_week', parsed.data.day_of_week)

  if (fetchError) {
    return Response.json({ error: 'Error al verificar disponibilidad' }, { status: 500 })
  }

  // Verificar solapamiento: nuevo slot [newStart, newEnd) solapa si newStart < existing.end_time AND newEnd > existing.start_time
  const newStart = parsed.data.start_time + ':00'
  const newEnd = parsed.data.end_time + ':00'

  const hasOverlap = (existing ?? []).some(
    (h) => newStart < h.end_time && newEnd > h.start_time
  )

  if (hasOverlap) {
    return Response.json(
      { error: 'Este horario se solapa con uno existente' },
      { status: 409 }
    )
  }

  // 5. INSERT — NO incluir tenant_id (la tabla no tiene ese campo; AR14)
  const { data, error } = await supabase
    .from('professional_schedules')
    .insert({
      professional_id: id,
      day_of_week: parsed.data.day_of_week,
      start_time: newStart,
      end_time: newEnd,
    })
    .select()
    .single()

  if (error) {
    // UNIQUE constraint (23505) — puede ser start_time duplicado o solapamiento no capturado
    if (error.code === '23505') {
      return Response.json({ error: 'Este horario se solapa con uno existente' }, { status: 409 })
    }
    return Response.json({ error: 'Error al crear el horario del profesional' }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}

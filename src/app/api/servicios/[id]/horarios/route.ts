import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { CreateServiceHourSchema } from '@/lib/schemas/servicios.schema'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json({ error: 'Solo administradores pueden gestionar horarios' }, { status: 403 })
  }

  const { id } = await params

  // 3. Query con RLS aplicado automáticamente — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('service_hours')
    .select('hour_id, service_id, tenant_id, day_of_week, start_time, end_time, slot_duration_minutes, active, created_at')
    .eq('service_id', id)
    .eq('active', true)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener horarios' }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json({ error: 'Solo administradores pueden gestionar horarios' }, { status: 403 })
  }

  const { id } = await params

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateServiceHourSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. INSERT con tenant_id explícito desde claims (AR14)
  const { data, error } = await supabase
    .from('service_hours')
    .insert({
      service_id: id,
      tenant_id: claims?.tenant_id as string,
      day_of_week: parsed.data.day_of_week,
      start_time: parsed.data.start_time + ':00',
      end_time: parsed.data.end_time + ':00',
      slot_duration_minutes: parsed.data.slot_duration_minutes ?? 30,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'Error al crear el horario' }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}

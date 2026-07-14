import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { CreateServiceExceptionSchema } from '@/lib/schemas/servicios.schema'

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
    return Response.json({ error: 'Solo administradores pueden gestionar excepciones' }, { status: 403 })
  }

  const { id } = await params

  // 3. Query excepciones futuras (a partir de hoy) — RLS filtra tenant automáticamente
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('service_exceptions')
    .select('exception_id, service_id, tenant_id, exception_date, reason, created_at')
    .eq('service_id', id)
    .gte('exception_date', today)
    .order('exception_date', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener excepciones' }, { status: 500 })
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
    return Response.json({ error: 'Solo administradores pueden gestionar excepciones' }, { status: 403 })
  }

  const { id } = await params

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateServiceExceptionSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. INSERT con tenant_id explícito desde claims (AR14)
  const { data, error } = await supabase
    .from('service_exceptions')
    .insert({
      service_id: id,
      tenant_id: claims?.tenant_id as string,
      exception_date: parsed.data.exception_date,
      reason: parsed.data.reason ?? null,
    })
    .select()
    .single()

  if (error) {
    // Manejar UNIQUE constraint (service_id, exception_date)
    if (error.code === '23505') {
      return Response.json({ error: 'Ya existe una excepción para esa fecha' }, { status: 409 })
    }
    return Response.json({ error: 'Error al crear la excepción' }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}

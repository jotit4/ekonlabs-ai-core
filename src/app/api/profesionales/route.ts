import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { CreateProfessionalSchema } from '@/lib/schemas/profesionales.schema'

export async function GET(): Promise<Response> {
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
      { error: 'Solo administradores pueden gestionar profesionales' },
      { status: 403 }
    )
  }

  // 3. Query con RLS automático — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('professionals')
    .select(`
      professional_id,
      tenant_id,
      name,
      email,
      active,
      created_at,
      service_professionals (
        service_id,
        services ( service_id, name )
      )
    `)
    .order('name', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener profesionales' }, { status: 500 })
  }

  // Aplanar servicios para la respuesta
  const professionals = (data ?? []).map((p) => ({
    professional_id: p.professional_id,
    tenant_id: p.tenant_id,
    name: p.name,
    email: p.email,
    active: p.active,
    created_at: p.created_at,
    services: (p.service_professionals ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((sp: any) => sp.services)
      .filter(Boolean) as { service_id: string; name: string }[],
  }))

  return Response.json({ data: professionals })
}

export async function POST(request: Request): Promise<Response> {
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
      { error: 'Solo administradores pueden gestionar profesionales' },
      { status: 403 }
    )
  }

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateProfessionalSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. INSERT con tenant_id explícito desde claims (INSERT siempre requiere tenant_id — AR14)
  const { data: professional, error: insertError } = await supabase
    .from('professionals')
    .insert({
      tenant_id: claims?.tenant_id as string,
      name: parsed.data.name,
      email: parsed.data.email,
    })
    .select()
    .single()

  if (insertError) {
    // Violación UNIQUE(email) — código Postgres 23505
    if (insertError.code === '23505') {
      return Response.json({ error: 'Ya existe un profesional con ese email' }, { status: 409 })
    }
    return Response.json({ error: 'Error al crear el profesional' }, { status: 500 })
  }

  // 5. INSERT en service_professionals si hay service_ids
  if (parsed.data.service_ids && parsed.data.service_ids.length > 0) {
    const rows = parsed.data.service_ids.map((service_id) => ({
      service_id,
      professional_id: professional.professional_id,
    }))

    const { error: spError } = await supabase
      .from('service_professionals')
      .insert(rows)

    if (spError) {
      return Response.json({ error: 'Error al asignar servicios al profesional' }, { status: 500 })
    }
  }

  // 6. Respuesta con servicios asignados
  const responseData = {
    ...professional,
    services: [] as { service_id: string; name: string }[],
  }

  return Response.json({ data: responseData }, { status: 201 })
}

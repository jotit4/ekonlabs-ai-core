import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { CreateServiceSchema } from '@/lib/schemas/servicios.schema'

export async function GET(): Promise<Response> {
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
    return Response.json(
      { error: 'Solo administradores pueden gestionar servicios' },
      { status: 403 }
    )
  }

  // 3. Query con RLS automático — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('services')
    .select(
      'service_id, tenant_id, name, calendar_id, professional_name, duration_minutes, active, booking_mode, capacity_per_slot, requires_prescription, is_referral_only, reminder_hours_before, reminder_instructions, prerequisite_note, created_at'
    )
    .order('name', { ascending: true })

  if (error) {
    return Response.json({ error: 'Error al obtener servicios' }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(request: Request): Promise<Response> {
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
    return Response.json(
      { error: 'Solo administradores pueden gestionar servicios' },
      { status: 403 }
    )
  }

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = CreateServiceSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. INSERT con tenant_id explícito desde claims (INSERT siempre requiere tenant_id — AR14)
  const { data, error } = await supabase
    .from('services')
    .insert({
      tenant_id: claims?.tenant_id as string,
      name: parsed.data.name,
      calendar_id: parsed.data.calendar_id,
      professional_name: parsed.data.professional_name ?? null,
      duration_minutes: parsed.data.duration_minutes ?? 60,
      booking_mode: parsed.data.booking_mode ?? 'appointment',
      reminder_hours_before: parsed.data.reminder_hours_before ?? null,
      reminder_instructions: parsed.data.reminder_instructions ?? null,
    })
    .select()
    .single()

  if (error) {
    // Violación UNIQUE(tenant_id, name) — código Postgres 23505
    if (error.code === '23505') {
      return Response.json({ error: 'Ya existe un servicio con ese nombre' }, { status: 409 })
    }
    return Response.json({ error: 'Error al crear el servicio' }, { status: 500 })
  }

  // 5. Audit log — tras INSERT exitoso (AC5)
  await logAudit({
    action: 'config_service_updated',
    entity_type: 'config',
    entity_id: data.service_id,
    supabase,
  })

  return Response.json({ data }, { status: 201 })
}

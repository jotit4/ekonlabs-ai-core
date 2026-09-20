import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { CreateServiceSchema } from '@/lib/schemas/servicios.schema'

// calendar_id (Google Calendar) es legacy y la columna services.calendar_id es
// NOT NULL. Para cuentas con calendario nativo, el seed de onboarding llena
// esa columna con un valor sintético inocuo con esta misma convención
// (`native_<tenant_id>_<slug>` — ver supabase/seeds/onboard_tenant.sql y
// demo-setup/01-demo-tenant.sql). La reproducimos acá para no pedirle el
// campo a la persona cuando el alta viene del dashboard.
function slugifyServiceName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'servicio'
}

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
      'service_id, tenant_id, name, calendar_id, professional_name, duration_minutes, active, booking_mode, capacity_per_slot, requires_prescription, is_referral_only, reminder_hours_before, reminder_instructions, prerequisite_note, reception_group, created_at'
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

  // 3b. calendar_id: si no vino, y la cuenta usa calendario nativo, derivamos
  // un valor sintético (ver slugifyServiceName arriba) en vez de exigírselo a
  // la persona. Si la cuenta NO usa calendario nativo, lo seguimos exigiendo.
  let calendarId = parsed.data.calendar_id?.trim() || ''
  if (!calendarId) {
    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .select('uses_native_calendar')
      .single()
    if (tenantError || !tenantRow) {
      // No sabemos si esta cuenta usa calendario nativo. Pedir el campo sería
      // mandar a la persona a completar algo que el formulario le esconde
      // justamente cuando la cuenta SÍ es nativa: mejor decir la verdad.
      console.error('[api/servicios/POST] no se pudo leer la config de la cuenta:', tenantError)
      return Response.json(
        { error: 'No pudimos verificar la configuración de la cuenta. Reintentá en unos segundos.' },
        { status: 503 }
      )
    }
    if (tenantRow.uses_native_calendar) {
      calendarId = `native_${claims?.tenant_id as string}_${slugifyServiceName(parsed.data.name)}`
    } else {
      return Response.json(
        {
          error: 'Datos inválidos',
          details: [{ path: ['calendar_id'], message: 'El calendario Google es requerido' }],
        },
        { status: 400 }
      )
    }
  }

  // 4. INSERT con tenant_id explícito desde claims (INSERT siempre requiere tenant_id — AR14)
  const { data, error } = await supabase
    .from('services')
    .insert({
      tenant_id: claims?.tenant_id as string,
      name: parsed.data.name,
      calendar_id: calendarId,
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

import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { SystemPromptOverrideSchema } from '@/lib/schemas/agente.schema'

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
      { error: 'Solo administradores pueden ver la configuración del agente' },
      { status: 403 }
    )
  }

  // 3. Query con RLS aplicado automáticamente — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('tenants')
    .select('tenant_id, system_prompt_override, rules, shadow_mode_enabled')
    .single()

  if (error) {
    return Response.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }

  return Response.json({ data })
}

export async function PATCH(request: Request): Promise<Response> {
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
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  const parsed = SystemPromptOverrideSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Override inválido', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Leer el valor anterior para el historial (RLS filtra automáticamente — AR14)
  const { data: currentData } = await supabase
    .from('tenants')
    .select('system_prompt_override')
    .single()

  // 5. UPDATE con condición explícita de tenant_id (RLS también aplica USING)
  const { error: updateError } = await supabase
    .from('tenants')
    .update({ system_prompt_override: parsed.data.system_prompt_override })
    .eq('tenant_id', claims?.tenant_id as string)

  if (updateError) {
    return Response.json({ error: 'Error al guardar el prompt' }, { status: 500 })
  }

  // 6. Registrar historial (no-crítico — no fallar si falla)
  const { error: historyError } = await supabase.from('system_prompt_history').insert({
    tenant_id: claims?.tenant_id as string,
    user_id: user.id,
    previous_content: currentData?.system_prompt_override ?? null,
    new_content: parsed.data.system_prompt_override,
  })
  if (historyError) {
    console.error('[agente/config] Error al registrar historial:', historyError)
  }

  // 7. Audit log
  await logAudit({
    action: 'config_system_prompt_updated',
    entity_type: 'config',
    entity_id: claims?.tenant_id as string,
    supabase,
  })

  return Response.json({ data: { system_prompt_override: parsed.data.system_prompt_override } })
}

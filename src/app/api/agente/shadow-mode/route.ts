import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'

/**
 * GET — lee el estado de shadow_mode (en `tenants`) para cualquier rol autenticado.
 * Lo consume el `ShadowModeBanner` (visible para todos los usuarios del dashboard).
 * La escritura (PATCH) sigue siendo admin-only.
 */
export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // RLS filtra por tenant — sin .eq() (AR14)
  const { data, error } = await supabase
    .from('tenants')
    .select('shadow_mode_enabled')
    .single()

  if (error) {
    return Response.json({ error: 'Error al obtener shadow mode' }, { status: 500 })
  }

  return Response.json({ data: { shadow_mode_enabled: data?.shadow_mode_enabled ?? false } })
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
    return Response.json({ error: 'Solo administradores pueden cambiar shadow mode' }, { status: 403 })
  }

  // 3. Parsear y validar body
  const body = await request.json().catch(() => null)
  if (body === null || typeof body.shadow_mode_enabled !== 'boolean') {
    return Response.json({ error: 'shadow_mode_enabled debe ser boolean' }, { status: 400 })
  }

  // 4. UPDATE con condición explícita de tenant_id (RLS también aplica USING)
  const { error: updateError } = await supabase
    .from('tenants')
    .update({ shadow_mode_enabled: body.shadow_mode_enabled })
    .eq('tenant_id', claims?.tenant_id as string)

  if (updateError) {
    return Response.json({ error: 'Error al actualizar shadow mode' }, { status: 500 })
  }

  // 5. Audit log — no-bloqueante
  await logAudit({
    action: 'config_shadow_mode_updated',
    entity_type: 'config',
    entity_id: claims?.tenant_id as string,
    supabase,
  })

  return Response.json({ data: { shadow_mode_enabled: body.shadow_mode_enabled } })
}

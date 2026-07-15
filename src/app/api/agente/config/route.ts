import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { ClinicConfigPatchSchema } from '@/lib/schemas/agente.schema'
import type { IaConfig } from '@/types/agente'

// Lectura: admin, doctor y receptionist. Escritura: admin y receptionist (Story 6.6).
const READ_ROLES = ['admin', 'doctor', 'receptionist']
const WRITE_ROLES = ['admin', 'receptionist']

const CONFIG_COLUMNS = 'org_id, clinic_name, agent_name, prompt_rules, ia_config, operations_config'

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — admin / doctor / receptionist
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (!READ_ROLES.includes(claims?.app_role as string)) {
    return Response.json(
      { error: 'Sin permiso para ver la configuración del agente' },
      { status: 403 }
    )
  }

  // 3. Query a la tabla canónica — RLS filtra por org_id = tenant_id() (AR14: sin .eq)
  const { data, error } = await supabase
    .from('v2_clinic_configs')
    .select(CONFIG_COLUMNS)
    .single()

  if (error) {
    return Response.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }

  return Response.json({ data })
}

export async function PATCH(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin / receptionist pueden escribir
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (!WRITE_ROLES.includes(claims?.app_role as string)) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. Parsear y validar body (PATCH parcial)
  const body = await request.json().catch(() => null)
  const parsed = ClinicConfigPatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Configuración inválida', details: parsed.error.issues },
      { status: 400 }
    )
  }

  // 4. Construir el update SÓLO con las llaves presentes (merge parcial, AC4)
  const updatePayload: Record<string, unknown> = {}
  if (parsed.data.agent_name !== undefined) updatePayload.agent_name = parsed.data.agent_name
  if (parsed.data.prompt_rules !== undefined) updatePayload.prompt_rules = parsed.data.prompt_rules
  if (parsed.data.operations_config !== undefined) {
    // `operations_config` incluye `booking_windows` (franjas horarias del agente
    // de WhatsApp, pedido ISADI 2026-07-14). Se persiste tal cual — jsonb, sin
    // migración — y el form del dashboard siempre envía el sub-objeto completo
    // (min_notice_hours + future_window_days + booking_windows juntos), por lo
    // que el reemplazo directo no pisa datos no editados en este submit.
    updatePayload.operations_config = parsed.data.operations_config
  }

  // 4b. ia_config: merge superficial sobre el existente (no pisar features/identity, AC4)
  if (parsed.data.ia_config !== undefined) {
    const { data: currentRow } = await supabase
      .from('v2_clinic_configs')
      .select('ia_config')
      .single()
    const currentIaConfig = (currentRow?.ia_config ?? {}) as IaConfig
    updatePayload.ia_config = { ...currentIaConfig, ...parsed.data.ia_config }
  }

  // Nada que actualizar → 400 (body vacío o sin campos editables)
  if (Object.keys(updatePayload).length === 0) {
    return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  // 5. UPDATE explícito por tenant (RLS también aplica USING) — sí lleva .eq en UPDATE
  const { data: updated, error: updateError } = await supabase
    .from('v2_clinic_configs')
    .update(updatePayload)
    .eq('org_id', claims?.tenant_id as string)
    .select(CONFIG_COLUMNS)
    .single()

  if (updateError) {
    return Response.json({ error: 'Error al guardar la configuración' }, { status: 500 })
  }

  // 6. Audit log
  await logAudit({
    action: 'config_agent_updated',
    entity_type: 'config',
    entity_id: claims?.tenant_id as string,
    supabase,
  })

  return Response.json({ data: updated })
}

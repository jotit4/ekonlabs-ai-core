import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { treatmentDischargeInputSchema } from '@/lib/schemas/treatment-plan.schema'

// POST /api/treatments/[id]/discharge — Alta / informe final del tratamiento (Story 14.6).
//
// EL ALTA ES UN EVENTO, no una edición de campos: en un solo request (1) sella
// `discharge_at` (server time — NUNCA del body, anti-backdating) + `discharge_report`
// en `treatment_plans` y (2) pasa `treatments.status` a 'completed'. Con eso la
// generación de nuevas sesiones queda bloqueada GRATIS: POST /generate ya responde
// 409 si status !== 'active' (no se toca ese route). Los turnos futuros YA generados
// NO se cancelan automáticamente (decisión clínica manual — fuera de scope).
//
// HCE (Ley 25.326 — datos de salud): roles 'admin', 'doctor' y 'receptionist' (ISADI:
// recepción hace la carga administrativa completa de la ficha clínica).
// Guard = patrón clinical-notes / treatments/[id]/plan.
//
// "Transacción" SIN RPC (precedente 13.6 — supabase-js no tiene transacciones sin RPC
// y una RPC exigiría migración nueva): writes secuenciales con orden seguro.
// El plan va PRIMERO (el informe es el documento legalmente crítico); si el paso 2
// falla queda un estado parcial REPARABLE: el 409 de "ya dado de alta" exige
// discharge_at != null AND status === 'completed', así un re-POST repara.
//
// El alta se permite desde cualquier status no-completed (un tratamiento 'expired'
// también merece informe de cierre); el status SIEMPRE termina en 'completed'.
//
// AR14: queries autenticadas SIN .eq('tenant_id', ...) — la RLS filtra
// (040 UPDATE doctor/admin para treatment_plans; 038 UPDATE para treatments).
// AR15: sin admin.ts. AR10: API Route, no Server Action.
//
// ⚠️ DEPENDENCIA DE RUNTIME: requiere migraciones 036/038 (treatments + RLS) y 040
// (treatment_plans) APLICADAS. Aún NO están aplicadas en prod — las aplica el usuario
// en EasyPanel. Si las tablas no existen, las queries devuelven error → 500
// (el frontend degrada con mensaje no rompiente).

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROLES = ['admin', 'doctor', 'receptionist']

// Validar formato UUID antes de cualquier query (B-11 — patrón session-note)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params

  // 0. UUID válido antes de tocar la DB
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'ID de tratamiento inválido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rol clínico — admin/doctor/receptionist
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // tenant_id SIEMPRE del JWT, nunca del body (AR-tenant)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Body — strictObject: SOLO discharge_report (discharge_at = server time)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = treatmentDischargeInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Tratamiento (RLS — otro tenant → null) → 404
  const { data: treatment, error: treatmentError } = await supabase
    .from('treatments')
    .select('treatment_id, status')
    .eq('treatment_id', id)
    .maybeSingle()

  if (treatmentError) {
    console.error('[treatments/discharge/POST] treatments query error:', treatmentError)
    return Response.json({ error: 'Error al obtener el tratamiento' }, { status: 500 })
  }
  if (!treatment) {
    return Response.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
  }

  // 5. Plan registrado es PRErequisito del alta (Given del epic) — no se auto-crea:
  //    un informe final sin plan es HCE inconsistente.
  const { data: plan, error: planError } = await supabase
    .from('treatment_plans')
    .select('plan_id, discharge_at')
    .eq('treatment_id', id)
    .maybeSingle()

  if (planError) {
    console.error('[treatments/discharge/POST] treatment_plans query error:', planError)
    return Response.json({ error: 'Error al obtener el plan' }, { status: 500 })
  }
  if (!plan) {
    return Response.json(
      { error: 'Registrá el plan de tratamiento antes de dar el alta' },
      { status: 409 },
    )
  }

  // 6. Idempotencia: 409 SOLO si el alta está COMPLETA (ambas escrituras hechas).
  //    discharge_at != null con status !== 'completed' = estado parcial de una falla
  //    previa → se permite re-POST y repara (vuelve a sellar plan + status).
  if (plan.discharge_at != null && treatment.status === 'completed') {
    return Response.json({ error: 'El tratamiento ya fue dado de alta' }, { status: 409 })
  }

  // 7. Paso 1 — plan PRIMERO (la HCE es lo legalmente crítico).
  //    discharge_at = server time (anti-backdating). author_id = quien da el alta.
  //    NO toca motivo_consulta/objetivo/cie10_code/indicated_sessions.
  //    updated_at lo mantiene el trigger trg_treatment_plans_updated_at.
  const { data: updatedPlan, error: planUpdateError } = await supabase
    .from('treatment_plans')
    .update({
      discharge_at: new Date().toISOString(),
      discharge_report: parsed.data.discharge_report,
      author_id: user.id,
    })
    .eq('plan_id', plan.plan_id)
    .select()
    .single()

  if (planUpdateError || !updatedPlan) {
    console.error('[treatments/discharge/POST] plan update error:', planUpdateError)
    return Response.json({ error: 'Error al guardar el informe final' }, { status: 500 })
  }

  // 8. Paso 2 — status DESPUÉS. Falla acá = estado parcial: informe guardado,
  //    tratamiento aún no 'completed'. Mensaje explícito (patrón 13.6) — el
  //    re-POST repara porque el 409 del paso 6 exige AMBAS condiciones.
  const { error: statusError, count } = await supabase
    .from('treatments')
    .update({ status: 'completed' }, { count: 'exact' })
    .eq('treatment_id', id)

  if (statusError || count === 0) {
    console.error('[treatments/discharge/POST] treatments status update error:', statusError)
    return Response.json(
      {
        error:
          'El informe final se guardó pero no se pudo marcar el tratamiento como completado. Reintentá el alta.',
      },
      { status: 500 },
    )
  }

  // 9. Audit — SOLO después de que AMBOS writes fueron exitosos
  await logAudit({
    action: 'treatment_discharged',
    entity_type: 'treatment',
    entity_id: id,
    supabase,
  })

  return Response.json({ plan: updatedPlan }, { status: 200 })
}

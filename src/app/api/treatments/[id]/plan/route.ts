import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { treatmentPlanInputSchema } from '@/lib/schemas/treatment-plan.schema'

// GET/PUT /api/treatments/[id]/plan — Plan de tratamiento 1:1 con el paquete (Story 14.2).
//
// HCE (Ley 25.326 — datos de salud): SOLO roles 'admin' y 'doctor'. receptionist → 403.
// Guard de rol = patrón clinical-notes (NO el de POST /api/treatments, que es agendamiento
// con admin/receptionist — copiarlo acá sería un bug de privacidad).
//
// AR14: queries autenticadas SIN .eq('tenant_id', ...) — la RLS de la migración 040 filtra
// (incluir tenant_id en el payload del upsert SÍ corresponde: columna NOT NULL + WITH CHECK).
// AR15: sin admin.ts. AR10: API Route, no Server Action.
//
// ⚠️ DEPENDENCIA DE RUNTIME: requiere la migración 040 (treatment_plans) APLICADA.
// Aún NO está aplicada en prod — la aplica el usuario en EasyPanel. Si la tabla no existe,
// las queries devuelven error → 500 (el frontend degrada con mensaje no rompiente).

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROLES = ['admin', 'doctor']

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rol clínico — SOLO admin/doctor (receptionist NO accede a HCE)
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. El tratamiento debe existir y ser visible por RLS (otro tenant → null → 404)
  const { data: treatment, error: treatmentError } = await supabase
    .from('treatments')
    .select('treatment_id')
    .eq('treatment_id', id)
    .maybeSingle()

  if (treatmentError) {
    console.error('[treatments/plan/GET] treatments query error:', treatmentError)
    return Response.json({ error: 'Error al obtener el tratamiento' }, { status: 500 })
  }
  if (!treatment) {
    return Response.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
  }

  // 4. Plan (null = aún no creado; se crea con el primer guardado)
  const { data: plan, error: planError } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('treatment_id', id)
    .maybeSingle()

  if (planError) {
    console.error('[treatments/plan/GET] treatment_plans query error:', planError)
    return Response.json({ error: 'Error al obtener el plan' }, { status: 500 })
  }

  return Response.json({ plan: plan ?? null }, { status: 200 })
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rol clínico — SOLO admin/doctor
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

  // 3. Body — strictObject rechaza discharge_*/tenant_id/patient_id/author_id
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = treatmentPlanInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 4. Tratamiento (RLS) → 404 + fuente del patient_id REAL (NUNCA del body)
  const { data: treatment, error: treatmentError } = await supabase
    .from('treatments')
    .select('treatment_id, patient_id')
    .eq('treatment_id', id)
    .maybeSingle()

  if (treatmentError) {
    console.error('[treatments/plan/PUT] treatments query error:', treatmentError)
    return Response.json({ error: 'Error al obtener el tratamiento' }, { status: 500 })
  }
  if (!treatment) {
    return Response.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
  }

  // 4b. Plan de SOLO LECTURA tras el alta (Story 14.6 — defensa en capas, no solo
  //     cosmética de UI): si el plan ya tiene discharge_at, no se edita más.
  //     Sin plan (maybeSingle → null) NO bloquea: sigue al upsert de creación.
  const { data: existingPlan, error: existingPlanError } = await supabase
    .from('treatment_plans')
    .select('discharge_at')
    .eq('treatment_id', id)
    .maybeSingle()

  if (existingPlanError) {
    console.error('[treatments/plan/PUT] treatment_plans query error:', existingPlanError)
    return Response.json({ error: 'Error al obtener el plan' }, { status: 500 })
  }
  if (existingPlan?.discharge_at != null) {
    return Response.json(
      { error: 'El tratamiento fue dado de alta — el plan es de solo lectura' },
      { status: 409 },
    )
  }

  // 5. Upsert — UNIQUE(treatment_id) de la migración 040 habilita ON CONFLICT.
  //    author_id = último editor (la trazabilidad histórica la da el audit log).
  //    NO escribe discharge_at/discharge_report (scope 14.6).
  //    updated_at lo mantiene el trigger trg_treatment_plans_updated_at.
  const { data: plan, error: upsertError } = await supabase
    .from('treatment_plans')
    .upsert(
      {
        tenant_id: tenantId,
        treatment_id: id,
        patient_id: treatment.patient_id,
        motivo_consulta: parsed.data.motivo_consulta ?? null,
        objetivo: parsed.data.objetivo ?? null,
        cie10_code: parsed.data.cie10_code ?? null,
        indicated_sessions: parsed.data.indicated_sessions ?? null,
        author_id: user.id,
      },
      { onConflict: 'treatment_id' },
    )
    .select()
    .single()

  if (upsertError || !plan) {
    console.error('[treatments/plan/PUT] upsert error:', upsertError)
    return Response.json({ error: 'Error al guardar el plan' }, { status: 500 })
  }

  // 6. Audit — DESPUÉS del write exitoso
  await logAudit({
    action: 'treatment_plan_updated',
    entity_type: 'treatment',
    entity_id: id,
    supabase,
  })

  return Response.json({ plan }, { status: 200 })
}

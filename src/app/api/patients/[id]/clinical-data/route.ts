import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import {
  patientClinicalDataSchema,
  PATIENT_CLINICAL_DATA_KEYS,
} from '@/lib/schemas/patient-clinical-data.schema'

// GET/PUT /api/patients/[id]/clinical-data — Antecedentes, alergias, medicación
// y cirugías estructurados del paciente (Story 14.4 — Epic 14 HCE; `cirugias`
// sumado en la digitalización de la ficha de admisión — migración 047).
//
// HCE (Ley 25.326 — datos de salud): roles 'admin', 'doctor' y 'receptionist' (ISADI:
// recepción hace la carga administrativa completa de la ficha clínica).
// ⚠️ A diferencia de 14.2/14.3 acá NO hay red de RLS: los 4 campos viven en `patients`
// y su RLS (migración 20260511000000) es por fila/tenant SIN distinción de rol — la
// privacidad de estas columnas es 100% capa de aplicación (este guard + el sellado de
// los read paths generales por select explícito). Riesgo residual aceptado en 14.1:
// un insider con JWT puede leer/escribir las columnas vía PostgREST directo.
//
// Este endpoint es la ÚNICA vía de lectura/escritura de los 4 campos clínicos:
// - El PATCH genérico de /api/patients/[id] es administrativo (receptionist/admin)
//   y su Zod stripea estas claves (test de regresión en su route.test.ts).
// - El select explícito SOLO trae los 4 campos + patient_id (nunca '*'): tampoco
//   debe convertirse en un leak de datos administrativos ni viceversa.
//
// AR14: queries autenticadas SIN .eq('tenant_id', ...) — la RLS por tenant filtra.
// AR15: sin admin.ts. AR10: API Route, no Server Action.
//
// ⚠️ DEPENDENCIA DE RUNTIME: requiere las migraciones 042 (antecedentes/alergias/
// medicacion) y 047 (cirugias) APLICADAS. Aún NO están aplicadas en prod — las
// aplica el usuario en EasyPanel. Sin ellas las queries fallan → 500 (el panel
// degrada con mensaje no rompiente).

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROLES = ['admin', 'doctor', 'receptionist']
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLINICAL_SELECT = 'patient_id, antecedentes, alergias, medicacion, cirugias'

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params

  // 1. UUID válido ANTES de tocar la DB (patrón B-11)
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'patient_id inválido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // 2. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 3. Rol clínico — admin/doctor/receptionist, SIN tocar la DB
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. Paciente visible por RLS (otro tenant → null → 404) — select explícito, NUNCA '*'
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select(CLINICAL_SELECT)
    .eq('patient_id', id)
    .maybeSingle()

  if (patientError) {
    console.error('[patients/clinical-data/GET] patients query error:', patientError)
    return Response.json({ error: 'Error al obtener los datos clínicos' }, { status: 500 })
  }
  if (!patient) {
    return Response.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  return Response.json(
    {
      clinical_data: {
        antecedentes: patient.antecedentes ?? null,
        alergias: patient.alergias ?? null,
        medicacion: patient.medicacion ?? null,
        cirugias: patient.cirugias ?? null,
      },
    },
    { status: 200 },
  )
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params

  // 1. UUID válido ANTES de tocar la DB (patrón B-11)
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'patient_id inválido' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // 2. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 3. Rol clínico — admin/doctor/receptionist, SIN tocar la DB
  const claims = parseJwtPayload(session.access_token)
  const appRole = claims?.app_role as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. Body — strictObject rechaza patient_id/tenant_id/notes/full_name/etc.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = patientClinicalDataSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // 5. El paciente debe existir y ser visible por RLS (otro tenant → null → 404)
  const { data: existing, error: existingError } = await supabase
    .from('patients')
    .select('patient_id')
    .eq('patient_id', id)
    .maybeSingle()

  if (existingError) {
    console.error('[patients/clinical-data/PUT] patients query error:', existingError)
    return Response.json({ error: 'Error al obtener el paciente' }, { status: 500 })
  }
  if (!existing) {
    return Response.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  // 6. UPDATE PARCIAL (NO upsert — la fila ES el paciente, ya existe).
  //    Solo las claves PRESENTES en el body crudo entran al payload (clave ausente
  //    = no tocar; Zod v4 normaliza ausentes a null en el output, por eso el chequeo
  //    de presencia va contra el body crudo y el valor sale del schema ya normalizado).
  //    JAMÁS incluye tenant_id/notes/full_name ni campos administrativos.
  //    `patients` NO tiene trigger de updated_at → se setea manualmente (mismo
  //    contrato que el PATCH genérico de /api/patients/[id]).
  const rawBody = body as Record<string, unknown>
  const updatePayload: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  }
  for (const key of PATIENT_CLINICAL_DATA_KEYS) {
    if (key in rawBody) {
      updatePayload[key] = parsed.data[key]
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('patients')
    .update(updatePayload)
    .eq('patient_id', id)
    .select(CLINICAL_SELECT)
    .single()

  if (updateError || !updated) {
    console.error('[patients/clinical-data/PUT] update error:', updateError)
    return Response.json({ error: 'Error al guardar los datos clínicos' }, { status: 500 })
  }

  // 7. Audit — DESPUÉS del write exitoso (cada autosave exitoso audita,
  //    precedente clinical_notes / session_note_updated)
  await logAudit({
    action: 'patient_clinical_data_updated',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json(
    {
      clinical_data: {
        antecedentes: updated.antecedentes ?? null,
        alergias: updated.alergias ?? null,
        medicacion: updated.medicacion ?? null,
        cirugias: updated.cirugias ?? null,
      },
    },
    { status: 200 },
  )
}

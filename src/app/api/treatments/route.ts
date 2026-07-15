import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { newTreatmentApiSchema } from '@/lib/schemas/treatment.schema'

// POST /api/treatments
// Crea EXACTAMENTE UNA fila en `treatments` = el BONO de N sesiones, con 0 sesiones
// agendadas. NO genera turnos (las sesiones se agendan después, MANUAL Y FLEXIBLE,
// vía POST /api/treatments/[id]/sessions). Valida solo que el profesional del bono
// atienda el servicio. `start_date` se setea = hoy y `pattern` se persiste vacío
// (`{ slots: [] }`) solo para satisfacer los NOT NULL de la columna (sin patrón
// semanal — el patrón confundía a la clínica, reclamo ISADI).
export async function POST(request: Request): Promise<Response> {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // tenant_id SIEMPRE del JWT, nunca del body (AR-tenant)
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Autorización por rol — admin o receptionist (igual que /api/services/[id]/profesionales)
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 3. Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = newTreatmentApiSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const {
    patient_id,
    service_id,
    professional_id,
    total_sessions,
    expires_at,
  } = parsed.data

  // start_date = hoy (el bono "arranca" al crearse). pattern vacío: ya no hay
  // patrón semanal, pero la columna es NOT NULL → persistimos { slots: [] }.
  const startDate = new Date().toLocaleDateString('en-CA') // 'YYYY-MM-DD'
  const emptyPattern = { slots: [] as unknown[] }

  // 4. Validar el profesional del paquete — Pedido A #2/#3 (ISADI 2026-07-14):
  //    el bono TAMBIÉN puede crearse sin profesional fijo ("cualquier profesional
  //    disponible"). `professional_id` es OPCIONAL en el schema:
  //    - Si viene: validar que ESE profesional atienda el servicio (comportamiento
  //      sin cambios).
  //    - Si NO viene: validar que el servicio tenga AL MENOS un profesional ACTIVO
  //      que lo atienda (si no, el bono quedaría inagendable). RLS de
  //      service_professionals filtra por tenant via JOIN a professionals — NO
  //      `.eq('tenant_id')` (AR14).
  if (professional_id) {
    const { data: spRows, error: spError } = await supabase
      .from('service_professionals')
      .select('professional_id')
      .eq('service_id', service_id)
      .eq('professional_id', professional_id)

    if (spError) {
      console.error('[treatments/POST] service_professionals check error:', spError)
      return Response.json({ error: 'Error al validar el profesional' }, { status: 500 })
    }

    if (!spRows || spRows.length === 0) {
      return Response.json(
        { error: `El profesional ${professional_id} no atiende ese servicio` },
        { status: 400 },
      )
    }
  } else {
    const { data: spRows, error: spError } = await supabase
      .from('service_professionals')
      .select('professional_id, professionals ( professional_id, active )')
      .eq('service_id', service_id)

    if (spError) {
      console.error('[treatments/POST] service_professionals (any) check error:', spError)
      return Response.json({ error: 'Error al validar los profesionales del servicio' }, { status: 500 })
    }

    type ProfRow = { professional_id: string; active: boolean } | null
    const hasActiveProfessional = (spRows ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => row.professionals as ProfRow)
      .some((p) => p != null && p.active === true)

    if (!hasActiveProfessional) {
      return Response.json(
        { error: 'El servicio no tiene profesionales disponibles' },
        { status: 400 },
      )
    }
  }

  // 5. Insertar la fila `treatments`.
  //    sessions_remaining = total_sessions (ninguna consumida aún), status = 'active'.
  //    tenant_id (del JWT) es NOT NULL + lo exige la policy WITH CHECK. created_by para trazabilidad.
  //    professional_id: null cuando el bono queda sin profesional fijo (columna nullable).
  const { data: inserted, error: insertError } = await supabase
    .from('treatments')
    .insert({
      tenant_id: tenantId,
      patient_id,
      service_id,
      professional_id: professional_id ?? null,
      total_sessions,
      sessions_remaining: total_sessions,
      start_date: startDate,
      pattern: emptyPattern,
      status: 'active',
      expires_at: expires_at ?? null,
      created_by: user.id,
    })
    .select('treatment_id')
    .single()

  if (insertError || !inserted) {
    console.error('[treatments/POST] insert error:', insertError)
    return Response.json({ error: 'Error al crear el paquete' }, { status: 500 })
  }

  // 6. Audit log — DESPUÉS del insert (ya hay treatment_id como entity_id)
  await logAudit({
    action: 'treatment_created',
    entity_type: 'treatment',
    entity_id: inserted.treatment_id,
    supabase,
  })

  return Response.json({ success: true, treatment_id: inserted.treatment_id }, { status: 201 })
}

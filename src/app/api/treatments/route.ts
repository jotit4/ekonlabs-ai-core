import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { newTreatmentApiSchema } from '@/lib/schemas/treatment.schema'

// POST /api/treatments
// Crea EXACTAMENTE UNA fila en `treatments` (Story 13.2 — "paquete" de sesiones).
// NO genera los N turnos (eso es la Story 13.3). NO valida disponibilidad del slot.
// Solo valida la FORMA del `pattern` (Zod) y que cada profesional atienda el servicio.
export async function POST(request: Request): Promise<Response> {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
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
    start_date,
    expires_at,
    pattern,
  } = parsed.data

  // 4. Validar que TODOS los profesionales (principal + cada slot) atiendan el servicio.
  //    RLS de service_professionals filtra por tenant via JOIN a professionals,
  //    así que esta consulta sólo ve filas del tenant del usuario (AR14 — NO .eq('tenant_id')).
  const uniqueProfIds = Array.from(
    new Set<string>([professional_id, ...pattern.slots.map((s) => s.professional_id)]),
  )

  const { data: spRows, error: spError } = await supabase
    .from('service_professionals')
    .select('professional_id')
    .eq('service_id', service_id)
    .in('professional_id', uniqueProfIds)

  if (spError) {
    console.error('[treatments/POST] service_professionals check error:', spError)
    return Response.json({ error: 'Error al validar el profesional' }, { status: 500 })
  }

  const allowedProfIds = new Set<string>((spRows ?? []).map((r) => r.professional_id as string))
  const missing = uniqueProfIds.filter((id) => !allowedProfIds.has(id))
  if (missing.length > 0) {
    return Response.json(
      { error: `El profesional ${missing[0]} no atiende ese servicio` },
      { status: 400 },
    )
  }

  // 5. Insertar la fila `treatments`.
  //    sessions_remaining = total_sessions (ninguna consumida aún), status = 'active'.
  //    tenant_id (del JWT) es NOT NULL + lo exige la policy WITH CHECK. created_by para trazabilidad.
  const { data: inserted, error: insertError } = await supabase
    .from('treatments')
    .insert({
      tenant_id: tenantId,
      patient_id,
      service_id,
      professional_id,
      total_sessions,
      sessions_remaining: total_sessions,
      start_date,
      pattern,
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

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { PatientApiSchema } from '@/lib/schemas/patient.schema'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params

  if (!id) {
    return Response.json({ error: 'patient_id requerido' }, { status: 400 })
  }

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener tenant_id y role del JWT
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  const role = (claims?.app_role ?? claims?.role) as string | undefined

  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Verificar rol
  if (role !== 'receptionist' && role !== 'admin') {
    return Response.json({ error: 'Acceso denegado — rol insuficiente' }, { status: 403 })
  }

  // 4. Parsear y validar body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = PatientApiSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const body = parsed.data

  // 5. Verificar que el paciente existe (RLS ya filtra por tenant)
  const { data: existingPatient } = await supabase
    .from('patients')
    .select('patient_id, dni')
    .eq('patient_id', id)
    .maybeSingle()

  if (!existingPatient) {
    return Response.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  // 6. Si el DNI cambia, verificar unicidad
  if (body.dni && body.dni !== existingPatient.dni) {
    const { data: dniConflict } = await supabase
      .from('patients')
      .select('patient_id')
      .eq('tenant_id', tenantId)
      .eq('dni', body.dni)
      .maybeSingle()

    if (dniConflict) {
      return Response.json(
        { error: 'Ya existe un paciente con ese DNI' },
        { status: 409 }
      )
    }
  }

  // 7. Limpiar strings vacíos a null
  const cleanedBody = {
    ...body,
    dni: body.dni || null,
    email: body.email || null,
    date_of_birth: body.date_of_birth || null,
    obra_social: body.obra_social || null,
    obra_social_number: body.obra_social_number || null,
    notes: body.notes || null,
    reason_for_visit: body.reason_for_visit || null,
    alternative_phone: body.alternative_phone || null,
    address: body.address || null,
    // Ficha de admisión (migración 047 — Fase 1 digitalización, campos ADMINISTRATIVOS)
    lugar: body.lugar || null,
    ocupacion: body.ocupacion || null,
    derivacion: body.derivacion || null,
    actividad_fisica: body.actividad_fisica || null,
    primary_professional_id: body.primary_professional_id || null,
    // NO actualizar tenant_id — siempre omitirlo del UPDATE
  }

  // 8. UPDATE en patients — NO actualizar tenant_id.
  //    SELLADO (Story 14.4): select de retorno EXPLÍCITO de columnas administrativas
  //    (= interface Patient) — un .select() pelado devolvería la fila completa, que
  //    tras la migración 042 incluye antecedentes/alergias/medicacion (HCE, Ley
  //    25.326, solo doctor/admin vía /clinical-data). Neutro en comportamiento:
  //    PatientForm no consume el body de la respuesta (solo invalida queries).
  //    Columnas futuras de patients deben agregarse acá a mano (default-deny).
  const { data: updated, error: updateError } = await supabase
    .from('patients')
    .update({
      ...cleanedBody,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', id)
    .select(
      'patient_id, tenant_id, phone_number, full_name, dni, date_of_birth, email, obra_social, obra_social_number, notes, reason_for_visit, alternative_phone, address, lugar, ocupacion, derivacion, actividad_fisica, primary_professional_id, created_at, updated_at, deletion_requested_at, deletion_effective_at'
    )
    .single()

  if (updateError) {
    // 23505 = unique_violation — puede ser teléfono duplicado
    if (updateError.code === '23505') {
      return Response.json(
        { error: 'Ya existe un paciente con ese teléfono' },
        { status: 409 }
      )
    }
    console.error('[patients/[id]/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al actualizar el paciente' }, { status: 500 })
  }

  // 9. Audit log
  await logAudit({
    action: 'patient_data_updated',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json({ patient: updated }, { status: 200 })
}

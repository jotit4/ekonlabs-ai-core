import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { PatientApiSchema } from '@/lib/schemas/patient.schema'

export async function POST(request: Request) {
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

  // 5. Verificar DNI único antes del INSERT (si hay DNI)
  if (body.dni) {
    const { data: existing } = await supabase
      .from('patients')
      .select('patient_id')
      .eq('tenant_id', tenantId)
      .eq('dni', body.dni)
      .maybeSingle()

    if (existing) {
      return Response.json(
        { error: 'Ya existe un paciente con ese DNI' },
        { status: 409 }
      )
    }
  }

  // 6. Limpiar strings vacíos a null
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
  }

  // 7. INSERT en patients con tenant_id del JWT
  const { data: inserted, error: insertError } = await supabase
    .from('patients')
    .insert({ tenant_id: tenantId, ...cleanedBody })
    .select('patient_id')
    .single()

  if (insertError) {
    // 23505 = unique_violation — puede ser teléfono duplicado (UNIQUE(tenant_id, phone_number))
    if (insertError.code === '23505') {
      return Response.json(
        { error: 'Ya existe un paciente con ese teléfono' },
        { status: 409 }
      )
    }
    console.error('[patients/POST] insert error:', insertError)
    return Response.json({ error: 'Error al crear el paciente' }, { status: 500 })
  }

  // 8. Audit log
  await logAudit({
    action: 'patient_data_updated',
    entity_type: 'patient',
    entity_id: inserted.patient_id,
    supabase,
  })

  return Response.json({ patient: { patient_id: inserted.patient_id } }, { status: 201 })
}

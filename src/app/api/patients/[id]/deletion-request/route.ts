import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { parseJwtPayload } from '@/lib/utils/jwt'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if ((claims?.app_role ?? claims?.role) !== 'admin') {
    return Response.json(
      { error: 'Solo administradores pueden solicitar la eliminación de un paciente' },
      { status: 403 }
    )
  }

  // 3. Verificar que el paciente existe y no tiene eliminación pendiente
  const { data: patient } = await supabase
    .from('patients')
    .select('patient_id, full_name, deletion_requested_at')
    .eq('patient_id', id)
    .maybeSingle()
  // NO agregar .eq('tenant_id', ...) — RLS filtra (AR14)

  if (!patient) {
    return Response.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  if (patient.deletion_requested_at) {
    return Response.json(
      { error: 'Este paciente ya tiene una eliminación pendiente' },
      { status: 409 }
    )
  }

  // 4. Calcular fechas
  const now = new Date()
  const deletionEffectiveAt = new Date(now)
  deletionEffectiveAt.setDate(deletionEffectiveAt.getDate() + 30)

  // 5. Marcar el paciente
  const { error: updateError } = await supabase
    .from('patients')
    .update({
      deletion_requested_at: now.toISOString(),
      deletion_effective_at: deletionEffectiveAt.toISOString(),
    })
    .eq('patient_id', id)
  // NO agregar .eq('tenant_id', ...) — RLS filtra (AR14)

  if (updateError) {
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
  }

  // 6. Audit trail — patient_deleted es la acción correcta para solicitud de supresión
  await logAudit({
    action: 'patient_deleted',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json(
    { success: true, deletion_effective_at: deletionEffectiveAt.toISOString() },
    { status: 200 }
  )
}

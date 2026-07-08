import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { DeletionRequestRow } from '@/types/deletion-requests'

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json(
      { error: 'Solo administradores pueden ver solicitudes de supresión' },
      { status: 403 }
    )
  }

  // 3. Query con RLS aplicado automáticamente — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('patients')
    .select('patient_id, full_name, dni, deletion_requested_at, deletion_effective_at')
    .not('deletion_requested_at', 'is', null)
    .order('deletion_requested_at', { ascending: false })

  if (error) {
    return Response.json({ error: 'Error al obtener solicitudes' }, { status: 500 })
  }

  // 4. Calcular status server-side
  const now = new Date()
  const rows: DeletionRequestRow[] = (data ?? []).map((p) => ({
    patient_id: p.patient_id as string,
    full_name: p.full_name as string,
    dni: p.dni as string | null,
    deletion_requested_at: p.deletion_requested_at as string,
    deletion_effective_at: p.deletion_effective_at as string,
    status: new Date(p.deletion_effective_at as string) > now ? 'pending' : 'processed',
  }))

  return Response.json({ data: rows })
}

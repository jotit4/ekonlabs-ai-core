import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { UpdateProfileSchema } from '@/lib/schemas/mi-perfil.schema'

// Story 10.8 — Datos de cuenta del usuario logueado (los 3 roles).
// Sin restricción de rol: cada usuario opera sobre su propia fila vía RLS.

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')

  // RLS dashboard_users_own_record permite leer la fila propia (user_id = auth.uid())
  const { data: row, error } = await supabase
    .from('dashboard_users')
    .select('full_name, email, role')
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('[api/me/profile/GET] error:', error)
    return Response.json({ error: 'Error al obtener el perfil' }, { status: 500 })
  }

  return Response.json({
    data: {
      full_name: row.full_name ?? '',
      // El email de login real es el de Supabase Auth (user.email), NO la columna
      // dashboard_users.email (copia denormalizada). Ver Dev Notes.
      login_email: user.email ?? row.email ?? '',
      role: claims?.app_role ?? row.role ?? '',
    },
  })
}

export async function PATCH(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // UPDATE solo full_name — RLS dashboard_users_update_own restringe a la fila propia
  // (user_id = auth.uid()). NO se envía role/tenant_id/professional_id (superficie segura).
  const { data, error } = await supabase
    .from('dashboard_users')
    .update({ full_name: parsed.data.full_name })
    .eq('user_id', user.id)
    .select('full_name')
    .single()

  if (error) {
    console.error('[api/me/profile/PATCH] error:', error)
    return Response.json({ error: 'Error al actualizar el perfil' }, { status: 500 })
  }

  return Response.json({ data })
}

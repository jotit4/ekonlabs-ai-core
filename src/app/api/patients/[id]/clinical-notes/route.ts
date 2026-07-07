import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { ClinicalNote } from '@/types/patients'

export type { ClinicalNote }

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  // Check de rol: admin, doctor y receptionist pueden leer notas clínicas (C-10)
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor', 'receptionist'].includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { data: notes, error } = await supabase
    .from('clinical_notes')
    .select('note_id, content, created_at, updated_at, author_id')
    .eq('patient_id', id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Error al obtener notas' }, { status: 500 })
  return Response.json({ notes: notes ?? [] }, { status: 200 })
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'No autorizado' }, { status: 401 })

  // Check de rol + obtener tenant_id del JWT (C-10)
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor', 'receptionist'].includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  let body: { content?: string }
  try {
    body = (await request.json()) as { content?: string }
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.content?.trim()) {
    return Response.json({ error: 'El contenido no puede estar vacío' }, { status: 400 })
  }

  // Obtener tenant_id del JWT (necesario para INSERT — es campo NOT NULL)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) return Response.json({ error: 'Tenant no encontrado' }, { status: 401 })

  const { data: note, error } = await supabase
    .from('clinical_notes')
    .insert({
      patient_id: id,
      author_id: user.id,
      tenant_id: tenantId,
      content: body.content.trim(),
    })
    .select('note_id, content, created_at, updated_at, author_id')
    .single()

  if (error) return Response.json({ error: 'Error al guardar la nota' }, { status: 500 })

  // Audit — patient_data_updated es la acción más cercana disponible
  await logAudit({ action: 'patient_data_updated', entity_type: 'patient', entity_id: id, supabase })

  return Response.json({ note }, { status: 201 })
}

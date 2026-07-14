import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'

interface RouteContext {
  params: Promise<{ id: string; note_id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id, note_id } = await context.params
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  // Check de rol: admin, doctor y receptionist pueden editar notas clínicas (C-10 extendido)
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor', 'receptionist'].includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // Check de autor: doctor y receptionist solo pueden editar sus propias notas
  // (admin puede editar cualquier nota). Espeja la RLS de clinical_notes_update_own
  // (migración 048 abrió SELECT/INSERT de clinical_notes a receptionist, pero
  // DEJÓ el UPDATE restringido a autor propio u admin — recepción edita las
  // notas que crea).
  if (appRole === 'doctor' || appRole === 'receptionist') {
    const { data: existingNote } = await supabase
      .from('clinical_notes')
      .select('author_id')
      .eq('note_id', note_id)
      .maybeSingle()
    if (existingNote && existingNote.author_id !== user.id) {
      return Response.json({ error: 'Sin permiso para editar esta nota' }, { status: 403 })
    }
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

  const { data: note, error } = await supabase
    .from('clinical_notes')
    .update({ content: body.content.trim(), updated_at: new Date().toISOString() })
    .eq('note_id', note_id)
    .eq('patient_id', id) // Seguridad adicional: confirmar que la nota pertenece al paciente
    .select('note_id, content, created_at, updated_at, author_id')
    .maybeSingle()

  if (error) return Response.json({ error: 'Error al actualizar la nota' }, { status: 500 })
  if (!note) return Response.json({ error: 'Nota no encontrada' }, { status: 404 })

  return Response.json({ note }, { status: 200 })
}

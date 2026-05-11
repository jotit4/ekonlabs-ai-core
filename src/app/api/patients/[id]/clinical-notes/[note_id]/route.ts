import { createSupabaseServerClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string; note_id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id, note_id } = await context.params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

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

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'

// DELETE /api/conversaciones/[phone]/notes/[id]
// Borra la nota con el id dado.
// RLS: solo el autor puede borrar su propia nota (author_user = auth.uid()).

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ phone: string; id: string }> }
) {
  const { id } = await context.params

  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { error } = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[notes/[id]/DELETE] error:', error)
    return Response.json({ error: 'Error al eliminar la nota' }, { status: 500 })
  }

  return Response.json({ status: 'ok' })
}

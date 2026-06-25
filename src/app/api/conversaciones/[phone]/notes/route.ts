import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { ConversationNote } from '@/types/conversations'

// GET /api/conversaciones/[phone]/notes
// Lista las notas privadas internas de la conversación, ordenadas por created_at DESC.
// RLS filtra por tenant: solo ve las notas de su tenant.

export async function GET(
  _request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[notes/GET] error:', error)
    return Response.json({ error: 'Error al obtener notas' }, { status: 500 })
  }

  return Response.json({ notes: (data ?? []) as ConversationNote[] })
}

// POST /api/conversaciones/[phone]/notes
// Body: { body: string } — nota privada interna (1..2000 chars)
// Insert en conversation_notes con author_user = auth.uid().

export async function POST(
  request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  let body: { body?: unknown }
  try {
    body = await request.json() as { body?: unknown }
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const noteBody = body.body
  if (typeof noteBody !== 'string' || noteBody.trim().length === 0) {
    return Response.json({ error: 'La nota no puede estar vacía' }, { status: 400 })
  }
  if (noteBody.length > 2000) {
    return Response.json({ error: 'La nota no puede superar los 2000 caracteres' }, { status: 400 })
  }

  const authorName = (claims?.name ?? claims?.full_name ?? null) as string | null

  const { data, error } = await supabase
    .from('conversation_notes')
    .insert({
      tenant_id: tenantId,
      phone_number: phone,
      author_user: user.id,
      author_name: authorName,
      body: noteBody,
    })
    .select()
    .single()

  if (error) {
    console.error('[notes/POST] insert error:', error)
    return Response.json({ error: 'Error al guardar la nota' }, { status: 500 })
  }

  return Response.json({ note: data as ConversationNote }, { status: 201 })
}

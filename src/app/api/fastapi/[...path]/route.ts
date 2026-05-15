import { createSupabaseServerClient } from '@/lib/supabase/server'

async function handleRequest() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // El proxy FastAPI no está implementado para este path — no revelar 501
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest

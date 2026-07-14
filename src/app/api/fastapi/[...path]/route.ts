import { getAuthClaims } from '@/lib/auth/claims'

async function handleRequest() {
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

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

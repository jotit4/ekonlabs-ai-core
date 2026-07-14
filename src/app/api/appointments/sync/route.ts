import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient, FastAPIError } from '@/lib/fastapi/client'

const fastapi = new FastAPIClient(
  process.env.FASTAPI_BASE_URL!,
  process.env.FASTAPI_API_KEY!,
)

export async function POST(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Parsear body opcional
  let body: { appointment_ids?: string[] } = {}
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    body = {}
  }

  // 3. Llamar a FastAPI (server-side — FASTAPI_BASE_URL nunca llega al cliente)
  try {
    const result = await fastapi.request<{ success: boolean; job_id?: string; async?: boolean }>(
      '/api/v1/appointments/sync',
      {
        method: 'POST',
        body: JSON.stringify({ ...body, tenant_id: tenantId }),
      }
    )

    const status = result.async ? 202 : 200
    return Response.json({ ...result, success: true }, { status })
  } catch (err) {
    if (err instanceof FastAPIError) {
      if (err.status >= 400 && err.status < 500) {
        return Response.json({ error: 'sync_failed', detail: err.body }, { status: 502 })
      }
    }
    // AbortError (timeout 5s) o error de red
    console.error('[appointments/sync/POST] error:', err)
    return Response.json({ error: 'sync_unavailable' }, { status: 503 })
  }
}

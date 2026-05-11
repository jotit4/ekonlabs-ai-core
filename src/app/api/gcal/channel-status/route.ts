import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient } from '@/lib/fastapi/client'

const fastapi = new FastAPIClient(
  process.env.FASTAPI_BASE_URL!,
  process.env.FASTAPI_API_KEY!,
)

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ status: 'unknown' }, { status: 200 })
  }

  // Stub: si FastAPI no está disponible en dev, retornar 'healthy'
  if (!process.env.FASTAPI_BASE_URL) {
    return Response.json({ status: 'healthy' }, { status: 200 })
  }

  try {
    const result = await fastapi.request<{ status: 'healthy' | 'degraded' }>(
      `/api/v1/gcal/channel-status?tenant_id=${tenantId}`,
      { method: 'GET' }
    )
    return Response.json({ status: result.status }, { status: 200 })
  } catch (err) {
    // 404 = sin canal registrado para el tenant
    if (err instanceof Error && (err as { status?: number }).status === 404) {
      return Response.json({ status: 'unknown' }, { status: 200 })
    }
    // Timeout o error de red: retornar 'unknown' — no propagar error al cliente
    console.error('[gcal/channel-status/GET] error:', err)
    return Response.json({ status: 'unknown' }, { status: 200 })
  }
}

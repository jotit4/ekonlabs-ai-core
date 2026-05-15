import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient, FastAPIError } from '@/lib/fastapi/client'
import type { AgentContext } from '@/types/conversations'

export async function GET(
  _request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener tenant_id del JWT
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Verificar env vars del servidor (no exponer al cliente)
  const fastapiBaseUrl = process.env.FASTAPI_BASE_URL
  const fastapiApiKey = process.env.FASTAPI_API_KEY
  if (!fastapiBaseUrl || !fastapiApiKey) {
    // Degradación silenciosa — FastAPI no configurado
    return Response.json({ context: null })
  }

  // 4. Llamar a FastAPI via FastAPIClient (server-side only)
  try {
    const client = new FastAPIClient(fastapiBaseUrl, fastapiApiKey)
    const data = await client.request<AgentContext>(
      `/api/v1/tenants/${tenantId}/conversations/${phone}/context`
    )
    return Response.json({ context: data })
  } catch (err) {
    if (err instanceof FastAPIError || err instanceof Error) {
      console.error('[context/GET] FastAPI error:', err)
    }
    // Degradación silenciosa — el panel mostrará estado de error sin romper la página
    return Response.json({ context: null })
  }
}

import { createSupabaseServerClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ conversation_id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { conversation_id } = await context.params

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Leer secrets server-side (NUNCA exponer al cliente)
  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL
  const chatwootToken = process.env.CHATWOOT_ACCESS_TOKEN
  const chatwootAccountId = process.env.CHATWOOT_ACCOUNT_ID

  if (!chatwootBaseUrl || !chatwootToken || !chatwootAccountId) {
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }

  // 3. Llamar a Chatwoot con timeout 5s (NFR22)
  try {
    const url = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversation_id}/messages`
    const response = await fetch(url, {
      headers: { api_access_token: chatwootToken },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return Response.json(
        { error: 'chatwoot_error', status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json() as { payload?: unknown[]; messages?: unknown[] }
    // Retornar solo los mensajes — NUNCA incluir chatwootToken en la respuesta
    return Response.json({ messages: data.payload ?? data.messages ?? [] }, { status: 200 })
  } catch (err) {
    // AbortError = timeout (NFR22)
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
    }
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }
}

import { createSupabaseServerClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ conversation_id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { conversation_id } = await context.params // SIEMPRE await en Next.js 16

  // Validar que conversation_id es un entero positivo (A-01: path traversal prevention)
  const convIdNum = parseInt(conversation_id, 10)
  if (isNaN(convIdNum) || convIdNum <= 0) {
    return Response.json({ error: 'ID de conversación inválido' }, { status: 400 })
  }

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Parsear y validar body
  let content: string
  try {
    const body = (await request.json()) as { content?: unknown }
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return Response.json({ error: 'content requerido' }, { status: 400 })
    }
    content = body.content.trim()
  } catch {
    return Response.json({ error: 'body inválido' }, { status: 400 })
  }

  // 3. Leer secrets server-side (NUNCA exponer al cliente — NFR24)
  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL
  const chatwootToken = process.env.CHATWOOT_ACCESS_TOKEN
  const chatwootAccountId = process.env.CHATWOOT_ACCOUNT_ID

  if (!chatwootBaseUrl || !chatwootToken || !chatwootAccountId) {
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }

  // 4. Enviar mensaje a Chatwoot con timeout 5s (NFR22)
  try {
    const url = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversation_id}/messages`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        api_access_token: chatwootToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.error('[chatwoot/send] Chatwoot error:', response.status)
      return Response.json(
        { error: 'chatwoot_error', status: response.status },
        { status: 503 }
      )
    }

    // Retornar solo confirmación — NUNCA incluir token ni URL (NFR24)
    return Response.json({ status: 'ok' }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
    }
    console.error('[chatwoot/send] error:', err)
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }
}

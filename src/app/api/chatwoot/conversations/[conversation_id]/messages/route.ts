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

  // 3. Resolver phone_number → Chatwoot conversation ID si conversation_id parece un teléfono
  // Formato: dígitos con prefijo opcional +, mínimo 9 dígitos (ej: 5491133334444 sin +)
  let resolvedId = conversation_id
  if (/^\+?\d{9,}$/.test(conversation_id)) {
    // Normalizar: quitar + si existe para la búsqueda en Chatwoot
    const phoneForSearch = conversation_id.startsWith('+') ? conversation_id.slice(1) : conversation_id
    try {
      // Buscar el contacto en Chatwoot por phone_number
      const searchUrl = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts/search?q=${encodeURIComponent(phoneForSearch)}&include_contacts=true`
      const searchRes = await fetch(searchUrl, {
        headers: { api_access_token: chatwootToken },
        signal: AbortSignal.timeout(5000),
      })
      if (searchRes.ok) {
        const searchData = await searchRes.json() as { payload?: Array<{ id: number; phone_number?: string }> }
        const contacts = searchData.payload ?? []
        // Buscar el contacto con phone_number que coincida
        const contact = contacts.find((c) => {
          const phone = c.phone_number ?? ''
          return phone.replace(/^\+/, '') === phoneForSearch
        })
        if (contact) {
          // Buscar la conversación más reciente de este contacto
          const convUrl = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts/${contact.id}/conversations`
          const convRes = await fetch(convUrl, {
            headers: { api_access_token: chatwootToken },
            signal: AbortSignal.timeout(5000),
          })
          if (convRes.ok) {
            const convData = await convRes.json() as { payload?: Array<{ id: number }> }
            const convs = convData.payload ?? []
            if (convs.length > 0) {
              // Usar la conversación más reciente (primera en la lista)
              resolvedId = String(convs[0].id)
            }
          }
        }
      }
    } catch (err) {
      // Si falla la resolución, continúa con el ID original (fallback)
      console.error('[chatwoot/messages] Error resolviendo phone_number a Chatwoot ID:', err)
    }
  }

  // 4. Llamar a Chatwoot con timeout 5s (NFR22)
  try {
    const url = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${resolvedId}/messages`
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

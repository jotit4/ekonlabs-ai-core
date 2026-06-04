import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatwootMessage } from '@/types/conversations'
import { filterEvolutionNoise } from '@/lib/conversations/evolution-noise'

interface RouteContext {
  params: Promise<{ conversation_id: string }>
}

// Fallback: leer historial de mensajes desde Supabase cuando Chatwoot no tiene el contacto
async function getMessagesFromSupabase(
  supabase: SupabaseClient,
  phone: string
): Promise<ChatwootMessage[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, content, role, created_at')
    .eq('phone_number', phone)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error || !data?.length) return []

  return data.map((row, index) => ({
    id: index + 1,
    content: row.content as string,
    // role 'user' = incoming (0), 'assistant'/'system' = outgoing (1)
    message_type: (row.role as string) === 'user' ? 0 : 1,
    created_at: Math.floor(new Date(row.created_at as string).getTime() / 1000),
    sender: {
      name: (row.role as string) === 'user' ? 'Paciente' : 'Ekon',
      type: (row.role as string) === 'user' ? 'contact' : 'agent_bot',
    },
  }))
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

  const isPhone = /^\+?\d{9,}$/.test(conversation_id)

  if (!chatwootBaseUrl || !chatwootToken || !chatwootAccountId) {
    // Sin config de Chatwoot: ir directo a Supabase si es teléfono
    if (isPhone) {
      const messages = await getMessagesFromSupabase(supabase, conversation_id)
      return Response.json({ messages }, { status: 200 })
    }
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }

  // 3. Resolver phone_number → Chatwoot conversation ID si conversation_id parece un teléfono
  // Formato: dígitos con prefijo opcional +, mínimo 9 dígitos (ej: 5491133334444 sin +)
  let resolvedId = conversation_id
  let foundInChatwoot = false
  if (isPhone) {
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
              resolvedId = String(convs[0].id)
              foundInChatwoot = true
            }
          }
        }
      }
    } catch (err) {
      // Si falla la resolución, continúa con fallback Supabase
      console.error('[chatwoot/messages] Error resolviendo phone_number a Chatwoot ID:', err)
    }

    // Si es teléfono y no se encontró en Chatwoot, usar Supabase directamente
    if (!foundInChatwoot) {
      const messages = await getMessagesFromSupabase(supabase, conversation_id)
      return Response.json({ messages }, { status: 200 })
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
      // Fallback a Supabase si Chatwoot falla y tenemos teléfono
      if (isPhone) {
        const messages = await getMessagesFromSupabase(supabase, conversation_id)
        return Response.json({ messages }, { status: 200 })
      }
      return Response.json(
        { error: 'chatwoot_error', status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json() as { payload?: unknown[]; messages?: unknown[] }
    const chatwootMessages = data.payload ?? data.messages ?? []

    // Si Chatwoot devuelve vacío y tenemos teléfono, fallback a Supabase
    if (chatwootMessages.length === 0 && isPhone) {
      const messages = await getMessagesFromSupabase(supabase, conversation_id)
      return Response.json({ messages }, { status: 200 })
    }

    // Ocultar el ruido técnico de Evolution API del hilo (AC2 Story 4.8).
    // Filtro idempotente y centralizado en evolution-noise.
    const messages = filterEvolutionNoise(chatwootMessages as ChatwootMessage[])

    // Retornar solo los mensajes — NUNCA incluir chatwootToken en la respuesta
    return Response.json({ messages }, { status: 200 })
  } catch (err) {
    // AbortError = timeout (NFR22) — fallback a Supabase
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      if (isPhone) {
        const messages = await getMessagesFromSupabase(supabase, conversation_id)
        return Response.json({ messages }, { status: 200 })
      }
      return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
    }
    if (isPhone) {
      const messages = await getMessagesFromSupabase(supabase, conversation_id)
      return Response.json({ messages }, { status: 200 })
    }
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }
}

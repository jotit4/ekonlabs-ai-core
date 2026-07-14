import { getAuthClaims } from '@/lib/auth/claims'

// Límite de tamaño de adjuntos: 10 MB por archivo
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

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
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 3. Leer secrets server-side (NUNCA exponer al cliente — NFR24)
  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL
  const chatwootToken = process.env.CHATWOOT_ACCESS_TOKEN
  const chatwootAccountId = process.env.CHATWOOT_ACCOUNT_ID

  if (!chatwootBaseUrl || !chatwootToken || !chatwootAccountId) {
    return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
  }

  const chatwootUrl = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversation_id}/messages`

  // 2. Detectar content-type del request para manejar JSON (texto) y multipart (adjuntos)
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // ── Caso multipart: texto + adjunto(s) ──────────────────────────────────
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return Response.json({ error: 'body inválido' }, { status: 400 })
    }

    const content = (formData.get('content') as string | null) ?? ''
    const attachmentEntries = formData.getAll('attachments') as File[]

    // Debe haber texto o al menos un adjunto
    if (!content.trim() && attachmentEntries.length === 0) {
      return Response.json({ error: 'content o adjunto requerido' }, { status: 400 })
    }

    // Validar tamaño de cada adjunto
    for (const file of attachmentEntries) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return Response.json(
          { error: 'archivo_muy_grande', max_mb: 10 },
          { status: 413 }
        )
      }
    }

    // Reenviar a Chatwoot como multipart
    const chatwootForm = new FormData()
    if (content.trim()) {
      chatwootForm.append('content', content.trim())
    }
    chatwootForm.append('message_type', 'outgoing')
    chatwootForm.append('private', 'false')
    for (const file of attachmentEntries) {
      chatwootForm.append('attachments[]', file)
    }

    try {
      const response = await fetch(chatwootUrl, {
        method: 'POST',
        headers: {
          api_access_token: chatwootToken,
          // No setear Content-Type — fetch lo setea automáticamente con el boundary correcto
        },
        body: chatwootForm,
        signal: AbortSignal.timeout(30000), // timeout más largo para uploads
      })

      if (!response.ok) {
        console.error('[chatwoot/send] Chatwoot error (multipart):', response.status)
        return Response.json(
          { error: 'chatwoot_error', status: response.status },
          { status: 503 }
        )
      }

      return Response.json({ status: 'ok' }, { status: 201 })
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
      }
      console.error('[chatwoot/send] error (multipart):', err)
      return Response.json({ error: 'chatwoot_unavailable' }, { status: 503 })
    }
  }

  // ── Caso JSON: solo texto (compatibilidad hacia atrás) ──────────────────────
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

  // 4. Enviar mensaje a Chatwoot con timeout 5s (NFR22)
  try {
    const response = await fetch(chatwootUrl, {
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

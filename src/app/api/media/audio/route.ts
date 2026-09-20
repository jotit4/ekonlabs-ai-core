// Proxy server-side para audios de Chatwoot.
// El browser no puede cargar directamente las URLs de Chatwoot
// (MEDIA_ELEMENT_ERROR code 4 — CORS/CSP cross-origin media block).
// Esta route fetchea el audio desde Node.js (sin restricciones CORS) y lo streamea al browser.

import { buildAllowedMediaHosts } from '@/lib/media/allowed-hosts'
import { getAuthClaims } from '@/lib/auth/claims'
import { requireTenantId } from '@/lib/auth/require-tenant'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get('url')

  // 1. Param requerido
  if (!rawUrl) {
    return new Response('Missing url param', { status: 400 })
  }

  // 2. Decodificar y validar la URL
  let targetUrl: URL
  try {
    targetUrl = new URL(rawUrl)
  } catch {
    return new Response('Invalid url param', { status: 400 })
  }

  // 3. Seguridad: solo proxear URLs de hosts permitidos (derivados de CHATWOOT_BASE_URL)
  if (!buildAllowedMediaHosts().has(targetUrl.hostname)) {
    return new Response('Forbidden: host not allowed', { status: 403 })
  }

  const sessionAuth = await getAuthClaims()
  if (!sessionAuth) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const tenantCheck = requireTenantId(sessionAuth.claims)
  if (tenantCheck instanceof Response) return tenantCheck

  // 4. Solo https
  if (targetUrl.protocol !== 'https:') {
    return new Response('Forbidden: only https allowed', { status: 403 })
  }

  // 5. Fetchear el audio server-side (Node.js no tiene restricciones CORS)
  try {
    const rangeHeader = request.headers.get('range')

    const upstreamHeaders: HeadersInit = {}
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15000),
    })

    if (!upstream.ok && upstream.status !== 206) {
      return new Response('Upstream error', { status: upstream.status })
    }

    // 6. Construir los headers de respuesta — pasar Content-Type y headers de rango
    const responseHeaders = new Headers()

    const contentType = upstream.headers.get('content-type') ?? 'audio/ogg'
    responseHeaders.set('content-type', contentType)

    const contentLength = upstream.headers.get('content-length')
    if (contentLength) responseHeaders.set('content-length', contentLength)

    const contentRange = upstream.headers.get('content-range')
    if (contentRange) responseHeaders.set('content-range', contentRange)

    const acceptRanges = upstream.headers.get('accept-ranges')
    if (acceptRanges) responseHeaders.set('accept-ranges', acceptRanges)

    // Cache corto — el audio no cambia pero no queremos caché indefinida
    responseHeaders.set('cache-control', 'private, max-age=3600')

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    // `AbortSignal.timeout()` rechaza con un DOMException, que en Node 22 NO es
    // `instanceof Error` — chequear por `name` cubre Error y DOMException por igual.
    const errName = (err as { name?: string } | null)?.name
    if (errName === 'AbortError' || errName === 'TimeoutError') {
      return new Response('Upstream timeout', { status: 504 })
    }
    return new Response('Internal error', { status: 500 })
  }
}

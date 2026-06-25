// Proxy server-side genérico para media de Chatwoot (imágenes, video, PDF).
// El browser no puede cargar directamente URLs de Chatwoot por CORS/CSP.
// Esta route fetchea el recurso desde Node.js (sin restricciones CORS) y lo streamea al browser.
//
// Seguridad: solo https + allowlist de hosts derivada de CHATWOOT_BASE_URL.
// Mismo patrón que /api/media/audio (helper compartido).

import { buildAllowedMediaHosts } from '@/lib/media/allowed-hosts'

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

  // 3. Solo https
  if (targetUrl.protocol !== 'https:') {
    return new Response('Forbidden: only https allowed', { status: 403 })
  }

  // 4. Seguridad: solo proxear URLs de hosts permitidos
  const allowedHosts = buildAllowedMediaHosts()
  if (!allowedHosts.has(targetUrl.hostname)) {
    return new Response('Forbidden: host not allowed', { status: 403 })
  }

  // 5. Fetchear el recurso server-side (Node.js no tiene restricciones CORS)
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

    // Content-type agnóstico — usar el que devuelve el upstream; fallback a octet-stream
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    responseHeaders.set('content-type', contentType)

    const contentLength = upstream.headers.get('content-length')
    if (contentLength) responseHeaders.set('content-length', contentLength)

    const contentRange = upstream.headers.get('content-range')
    if (contentRange) responseHeaders.set('content-range', contentRange)

    const acceptRanges = upstream.headers.get('accept-ranges')
    if (acceptRanges) responseHeaders.set('accept-ranges', acceptRanges)

    // Cache corto — el recurso no cambia pero no queremos caché indefinida
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

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// El host permitido se deriva de CHATWOOT_BASE_URL (no se hardcodea ningún dominio).
const ALLOWED_HOST = 'chatwoot.test'
const ALLOWED_URL = `https://${ALLOWED_HOST}/rails/active_storage/blobs/img.jpg`
const OTHER_HOST_URL = 'https://malicious.example.com/img.jpg'
const HTTP_URL = `http://${ALLOWED_HOST}/img.jpg`

function makeRequest(url: string | null, rangeHeader?: string) {
  const reqUrl = url !== null
    ? `http://localhost/api/media/file?url=${encodeURIComponent(url)}`
    : 'http://localhost/api/media/file'
  const headers: Record<string, string> = {}
  if (rangeHeader) headers['range'] = rangeHeader
  return new Request(reqUrl, { headers })
}

// Fake upstream response helper
function makeUpstreamResponse(overrides: {
  ok?: boolean
  status?: number
  contentType?: string
  body?: BodyInit | null
}) {
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    headers: new Headers({
      'content-type': overrides.contentType ?? 'image/jpeg',
      'content-length': '1024',
    }),
    body: overrides.body ?? null,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/media/file', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Por defecto: el host permitido se deriva de CHATWOOT_BASE_URL
    process.env = { ...originalEnv, CHATWOOT_BASE_URL: `https://${ALLOWED_HOST}` }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  // ─── Validación de parámetros ───────────────────────────────────────────────

  it('retorna 400 si falta el param url', async () => {
    const req = makeRequest(null)
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Missing url param')
  })

  it('retorna 400 si la URL es inválida', async () => {
    const req = makeRequest('not-a-url')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid url param')
  })

  // ─── Seguridad: protocolo ───────────────────────────────────────────────────

  it('retorna 403 si la URL usa http (no https)', async () => {
    const req = makeRequest(HTTP_URL)
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden: only https allowed')
  })

  // ─── Seguridad: allowlist de hosts ─────────────────────────────────────────

  it('retorna 403 si el host no está en la allowlist', async () => {
    const req = makeRequest(OTHER_HOST_URL)
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden: host not allowed')
  })

  it('permite el host derivado de CHATWOOT_BASE_URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeUpstreamResponse({})))

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('rechaza todo (403) si CHATWOOT_BASE_URL no está configurado (deny-by-default)', async () => {
    delete process.env.CHATWOOT_BASE_URL

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden: host not allowed')
  })

  it('permite un host derivado de CHATWOOT_BASE_URL si está configurado', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://custom-chatwoot.mycompany.com'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeUpstreamResponse({})))

    const req = makeRequest('https://custom-chatwoot.mycompany.com/rails/active_storage/img.jpg')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('sigue rechazando un host externo aunque CHATWOOT_BASE_URL esté configurado', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://custom-chatwoot.mycompany.com'

    const req = makeRequest(OTHER_HOST_URL)
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('maneja CHATWOOT_BASE_URL inválida sin lanzar excepción (deny-by-default)', async () => {
    process.env.CHATWOOT_BASE_URL = 'not-a-valid-url'

    // URL inválida → allowlist vacía → 403 graceful, NO una excepción/500
    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden: host not allowed')
  })

  // ─── Proxy de contenido ─────────────────────────────────────────────────────

  it('pasa el content-type del upstream en la respuesta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeUpstreamResponse({ contentType: 'image/png' }))
    )

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('usa application/octet-stream como fallback si el upstream no informa content-type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}), // sin content-type
        body: null,
      })
    )

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
  })

  it('pasa el header Range al upstream cuando el cliente lo envía', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeUpstreamResponse({ status: 206 }))
    vi.stubGlobal('fetch', mockFetch)

    const req = makeRequest(ALLOWED_URL, 'bytes=0-1023')
    await GET(req)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['Range']).toBe('bytes=0-1023')
  })

  it('retorna el status del upstream (206 para respuestas de rango)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false, // 206 no es "ok" en fetch estándar, pero lo manejamos
        status: 206,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        body: null,
      })
    )

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(206)
  })

  it('retorna el status del upstream cuando el upstream retorna un error (!ok y no 206)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeUpstreamResponse({ ok: false, status: 404 }))
    )

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('setea cache-control: private, max-age=3600', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeUpstreamResponse({})))

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
  })

  // ─── Manejo de errores ──────────────────────────────────────────────────────

  it('retorna 504 cuando el upstream hace timeout (AbortError como Error con name)', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(504)
    expect(await res.text()).toBe('Upstream timeout')
  })

  it('retorna 504 cuando el upstream hace timeout (TimeoutError)', async () => {
    const timeoutError = new Error('timeout')
    timeoutError.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError))

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(504)
  })

  it('retorna 500 ante un error inesperado del fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

    const req = makeRequest(ALLOWED_URL)
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal error')
  })
})

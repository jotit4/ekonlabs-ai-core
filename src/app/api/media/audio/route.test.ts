import { vi, describe, it, expect, afterEach } from 'vitest'

import { GET } from './route'

const ALLOWED_URL = 'https://ruzzi-chatwoot.az23sf.easypanel.host/rails/active_storage/blobs/redirect/abc123/audio.oga'

function makeRequest(url: string, extraHeaders: Record<string, string> = {}) {
  return new Request(`http://localhost/api/media/audio?url=${encodeURIComponent(url)}`, {
    method: 'GET',
    headers: extraHeaders,
  })
}

describe('GET /api/media/audio', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 400 si falta el param url', async () => {
    const req = new Request('http://localhost/api/media/audio', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('retorna 400 si la url no es una URL válida', async () => {
    const req = new Request('http://localhost/api/media/audio?url=not-a-url', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('retorna 403 si el host no es el permitido', async () => {
    const req = makeRequest('https://evil.example.com/audio.ogg')
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('Forbidden: host not allowed')
  })

  it('retorna 403 si la URL usa http en vez de https', async () => {
    const req = makeRequest('http://ruzzi-chatwoot.az23sf.easypanel.host/audio.ogg')
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('Forbidden: only https allowed')
  })

  it('streamea el audio con 200 y Content-Type correcto', async () => {
    const fakeBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([79, 103, 103, 83]))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: fakeBody,
        headers: new Headers({
          'content-type': 'audio/ogg',
          'content-length': '4',
          'accept-ranges': 'bytes',
        }),
      })
    )

    const res = await GET(makeRequest(ALLOWED_URL))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/ogg')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
  })

  it('pasa el header Range al upstream para seeking', async () => {
    let capturedHeaders: Headers | undefined

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        capturedHeaders = new Headers(opts?.headers as HeadersInit)
        return Promise.resolve({
          ok: true,
          status: 206,
          body: null,
          headers: new Headers({
            'content-type': 'audio/ogg',
            'content-range': 'bytes 0-999/5000',
            'accept-ranges': 'bytes',
          }),
        })
      })
    )

    const res = await GET(makeRequest(ALLOWED_URL, { range: 'bytes=0-999' }))
    expect(res.status).toBe(206)
    expect(capturedHeaders?.get('range')).toBe('bytes=0-999')
    expect(res.headers.get('content-range')).toBe('bytes 0-999/5000')
  })

  it('retorna 504 si el upstream da timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const res = await GET(makeRequest(ALLOWED_URL))
    expect(res.status).toBe(504)
  })

  it('retorna el status del upstream si no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        body: null,
        headers: new Headers(),
      })
    )

    const res = await GET(makeRequest(ALLOWED_URL))
    expect(res.status).toBe(404)
  })

  it('NO es posible hacer SSRF a hosts internos (127.0.0.1)', async () => {
    const req = makeRequest('https://127.0.0.1/secret')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('NO es posible proxear a localhost', async () => {
    const req = makeRequest('https://localhost/secret')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

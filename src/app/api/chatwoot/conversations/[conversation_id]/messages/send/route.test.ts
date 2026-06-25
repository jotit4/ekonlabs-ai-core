import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}))

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

// Mock createSupabaseServerClient
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
    })
  ),
}))

import { POST } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// IMPORTANTE: usar ID numérico válido para que la nueva validación no interfiera con otros tests
const CONVERSATION_ID = '123'

function makeContext(conversation_id: string = CONVERSATION_ID) {
  return { params: Promise.resolve({ conversation_id }) }
}

function makeRequest(body: object = { content: 'Hola paciente' }) {
  return new Request(
    `http://localhost/api/chatwoot/conversations/${CONVERSATION_ID}/messages/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/chatwoot/conversations/[conversation_id]/messages/send', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    process.env = {
      ...originalEnv,
      CHATWOOT_BASE_URL: 'https://chatwoot.example.com',
      CHATWOOT_ACCESS_TOKEN: 'secret-token-123',
      CHATWOOT_ACCOUNT_ID: '42',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retorna 400 si conversation_id no es un número (A-01)', async () => {
    const res = await POST(makeRequest(), makeContext('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('ID de conversación inválido')
  })

  it('retorna 400 si conversation_id es 0 (no positivo)', async () => {
    const res = await POST(makeRequest(), makeContext('0'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('ID de conversación inválido')
  })

  it('retorna 400 si conversation_id es negativo', async () => {
    const res = await POST(makeRequest(), makeContext('-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('ID de conversación inválido')
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('retorna 400 si content está vacío', async () => {
    const res = await POST(makeRequest({ content: '' }), makeContext())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('content requerido')
  })

  it('retorna 400 si content es solo espacios', async () => {
    const res = await POST(makeRequest({ content: '   ' }), makeContext())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('content requerido')
  })

  it('retorna 503 si faltan env vars de Chatwoot', async () => {
    process.env = { ...originalEnv }
    delete process.env.CHATWOOT_BASE_URL
    delete process.env.CHATWOOT_ACCESS_TOKEN
    delete process.env.CHATWOOT_ACCOUNT_ID

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('chatwoot_unavailable')
  })

  it('retorna 201 con { status: "ok" } cuando Chatwoot confirma el envío', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 999 }),
      })
    )

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('retorna 503 cuando Chatwoot da timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('chatwoot_unavailable')
  })

  it('retorna 503 cuando Chatwoot retorna !ok (ej: 422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
      })
    )

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('chatwoot_error')
  })

  it('CHATWOOT_ACCESS_TOKEN nunca aparece en la respuesta (NFR24)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 999 }),
      })
    )

    const res = await POST(makeRequest(), makeContext())
    const responseText = JSON.stringify(await res.json())
    expect(responseText).not.toContain('secret-token-123')
    expect(responseText).not.toContain('CHATWOOT_ACCESS_TOKEN')
  })

  it('el body enviado a Chatwoot incluye message_type: "outgoing" y private: false', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 999 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ content: 'Test mensaje' }), makeContext())

    expect(mockFetch).toHaveBeenCalledOnce()
    const callArgs = mockFetch.mock.calls[0]
    const bodyStr = callArgs[1].body as string
    const bodyParsed = JSON.parse(bodyStr)
    expect(bodyParsed.message_type).toBe('outgoing')
    expect(bodyParsed.private).toBe(false)
    expect(bodyParsed.content).toBe('Test mensaje')
  })

  // ─── Tests multipart (A3) ─────────────────────────────────────────────────

  function makeMultipartRequest(content: string, files: File[] = []) {
    const form = new FormData()
    if (content) form.append('content', content)
    for (const f of files) form.append('attachments', f)
    return new Request(
      `http://localhost/api/chatwoot/conversations/${CONVERSATION_ID}/messages/send`,
      {
        method: 'POST',
        // No setear Content-Type — FormData lo setea automáticamente
        body: form,
      }
    )
  }

  it('retorna 201 al enviar multipart con texto y adjunto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1000 }),
      })
    )

    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeMultipartRequest('Mirá esta foto', [file]), makeContext())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('retorna 201 al enviar multipart con solo adjunto (sin texto)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    )

    const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })
    const res = await POST(makeMultipartRequest('', [file]), makeContext())
    expect(res.status).toBe(201)
  })

  it('retorna 400 al enviar multipart sin texto ni adjunto', async () => {
    const res = await POST(makeMultipartRequest('', []), makeContext())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('content o adjunto requerido')
  })

  it('retorna 413 si el adjunto supera 10 MB', async () => {
    // jsdom no preserva el .size de File al hacer formData() roundtrip, así que
    // mockeamos request.formData() para devolver un File con .size grande.
    const bigFile = new File(['x'], 'grande.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024, configurable: true })

    const req = makeMultipartRequest('texto', [bigFile])
    vi.spyOn(req, 'formData').mockResolvedValue(
      Object.assign(new FormData(), {
        get: (k: string) => (k === 'content' ? 'texto' : null),
        getAll: (k: string) => (k === 'attachments' ? [bigFile] : []),
      }) as unknown as FormData
    )

    const res = await POST(req, makeContext())
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toBe('archivo_muy_grande')
  })

  it('el envío multipart NO incluye Content-Type header manual (lo pone FormData)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await POST(makeMultipartRequest('foto', [file]), makeContext())

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    // El header Content-Type NO debe estar seteado manualmente (lo setea FormData con el boundary)
    const headers = options.headers as Record<string, string> | undefined
    expect(headers?.['Content-Type']).toBeUndefined()
  })

  it('retorna 401 en multipart si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeMultipartRequest('foto', [file]), makeContext())
    expect(res.status).toBe(401)
  })

  it('retorna 503 en multipart si faltan env vars', async () => {
    process.env = { ...originalEnv }
    delete process.env.CHATWOOT_BASE_URL
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeMultipartRequest('foto', [file]), makeContext())
    expect(res.status).toBe(503)
  })
})

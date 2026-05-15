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

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONVERSATION_ID = 'conv-uuid-123'

function makeContext(conversation_id: string = CONVERSATION_ID) {
  return { params: Promise.resolve({ conversation_id }) }
}

function makeRequest() {
  return new Request(
    `http://localhost/api/chatwoot/conversations/${CONVERSATION_ID}/messages`,
    { method: 'GET' }
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/chatwoot/conversations/[conversation_id]/messages', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    // Configurar env vars para chatwoot
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
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('retorna 200 con mensajes cuando Chatwoot responde correctamente', async () => {
    const mockMessages = [
      { id: 1, content: 'Hola', message_type: 0, created_at: 1715000000 },
      { id: 2, content: 'Buenos días', message_type: 1, created_at: 1715000060 },
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ payload: mockMessages }),
      })
    )

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].content).toBe('Hola')
  })

  it('retorna 503 con error chatwoot_unavailable cuando Chatwoot da timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('chatwoot_unavailable')
  })

  it('CHATWOOT_ACCESS_TOKEN nunca aparece en la respuesta', async () => {
    const mockMessages = [{ id: 1, content: 'Test', message_type: 0, created_at: 1715000000 }]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ payload: mockMessages }),
      })
    )

    const res = await GET(makeRequest(), makeContext())
    const responseText = JSON.stringify(await res.json())
    expect(responseText).not.toContain('secret-token-123')
    expect(responseText).not.toContain('CHATWOOT_ACCESS_TOKEN')
  })

  describe('resolución de phone_number → Chatwoot conversation ID', () => {
    const PHONE_NO_PLUS = '5491133334444'

    it('cuando conversation_id es un phone_number (solo dígitos ≥9), resuelve phone → contact → conversation ID', async () => {
      const mockMessages = [
        { id: 10, content: 'Hola', message_type: 0, created_at: 1715000000 },
      ]

      let callCount = 0
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          callCount++
          if (typeof url === 'string' && url.includes('/contacts/search')) {
            // Búsqueda de contacto
            return {
              ok: true,
              json: async () => ({
                payload: [{ id: 99, phone_number: '+5491133334444' }],
              }),
            }
          }
          if (typeof url === 'string' && url.includes('/contacts/99/conversations')) {
            // Conversaciones del contacto
            return {
              ok: true,
              json: async () => ({ payload: [{ id: 777 }] }),
            }
          }
          // Fetch de mensajes con el ID resuelto (777)
          expect(url).toContain('/conversations/777/messages')
          return {
            ok: true,
            json: async () => ({ payload: mockMessages }),
          }
        })
      )

      const res = await GET(
        new Request(`http://localhost/api/chatwoot/conversations/${PHONE_NO_PLUS}/messages`),
        { params: Promise.resolve({ conversation_id: PHONE_NO_PLUS }) }
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].content).toBe('Hola')
      // Debe haber hecho 3 llamadas: search + conversations + messages
      expect(callCount).toBe(3)
    })

    it('cuando conversation_id tiene formato +DDDDDDDDDDD (con +), también activa la resolución', async () => {
      const PHONE_WITH_PLUS = '+5491133334444'
      let searchCalled = false

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('/contacts/search')) {
            searchCalled = true
            return {
              ok: true,
              json: async () => ({ payload: [] }), // sin resultados → fallback
            }
          }
          // Fallback: usa el conversation_id original con +
          return {
            ok: true,
            json: async () => ({ payload: [] }),
          }
        })
      )

      const res = await GET(
        new Request(`http://localhost/api/chatwoot/conversations/${PHONE_WITH_PLUS}/messages`),
        { params: Promise.resolve({ conversation_id: PHONE_WITH_PLUS }) }
      )
      expect(res.status).toBe(200)
      // La búsqueda de contacto fue intentada
      expect(searchCalled).toBe(true)
    })

    it('cuando la resolución de phone falla (sin contacto), usa el conversation_id original como fallback', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('/contacts/search')) {
            return { ok: true, json: async () => ({ payload: [] }) }
          }
          // Fallback: usa el phone number como conversation_id
          return { ok: true, json: async () => ({ payload: [] }) }
        })
      )

      const res = await GET(
        new Request(`http://localhost/api/chatwoot/conversations/${PHONE_NO_PLUS}/messages`),
        { params: Promise.resolve({ conversation_id: PHONE_NO_PLUS }) }
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.messages).toHaveLength(0)
    })
  })
})

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
})

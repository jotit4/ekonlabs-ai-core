import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — factories de mock
const { mockGetUser, mockGetSession, mockFrom, mockRpc, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' }),
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
        getSession: mockGetSession,
      },
      from: mockFrom,
      rpc: mockRpc,
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest() {
  return new Request('http://localhost/api/conversations', { method: 'GET' })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: admin autenticado con sesión válida
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-admin-token' } },
    })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET()

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('403 si el rol no tiene acceso (receptionist)', async () => {
    mockParseJwt.mockReturnValueOnce({
      app_role: 'receptionist',
      tenant_id: 'tenant-1',
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await GET()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna lista vacía si no hay thread_states', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    // Simulamos cadena de llamadas: from('thread_states').select(...).order(...)
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toEqual([])
  })

  it('500 si thread_states falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const mockOrder = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Error al obtener conversaciones')
  })

  it('retorna conversaciones con status derivado correctamente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const threadStates = [
      {
        phone_number: '+5491111111111',
        status: 'paused',
        paused_reason: 'low_confidence',
        updated_at: '2026-05-11T14:00:00.000Z',
      },
    ]

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // from('thread_states')
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: threadStates, error: null }),
          }),
        }
      } else {
        // from('patients')
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
    })

    // Mock RPC get_latest_messages_by_phone
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].status).toBe('needs_intervention')
    expect(body.conversations[0].phone_number).toBe('+5491111111111')
  })

  it('confidence_level es medium cuando paused_reason no es null ni low_confidence', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const threadStates = [
      {
        phone_number: '+5491111111111',
        status: 'paused',
        paused_reason: 'human_takeover', // No es 'low_confidence' ni null
        updated_at: '2026-05-11T14:00:00.000Z',
      },
    ]

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: threadStates, error: null }),
          }),
        }
      } else {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
    })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].confidence_level).toBe('medium')
  })

  it('500 si get_latest_messages_by_phone falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const threadStates = [
      {
        phone_number: '+5491111111111',
        status: 'active',
        paused_reason: null,
        updated_at: '2026-05-11T14:00:00.000Z',
      },
    ]

    mockFrom.mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: threadStates, error: null }),
        }),
      }
    })

    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Error al obtener mensajes')
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted — factories de mock
const { mockGetUser, mockGetSession, mockFastAPIRequest } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFastAPIRequest: vi.fn(),
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
    })
  ),
}))

// Mock FastAPIClient
vi.mock('@/lib/fastapi/client', () => {
  class FastAPIError extends Error {
    public readonly status: number
    public readonly body: unknown
    constructor(message: string, status: number, body: unknown) {
      super(message)
      this.name = 'FastAPIError'
      this.status = status
      this.body = body
    }
  }

  class FastAPIClient {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(..._args: unknown[]) {}
    request(...args: unknown[]) {
      return mockFastAPIRequest(...args)
    }
  }

  return { FastAPIClient, FastAPIError }
})

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeRequest(phone: string = '+5491111111111') {
  return new Request(`http://localhost/api/conversaciones/${phone}/context`, { method: 'GET' })
}

function makeContext(phone: string = '+5491111111111') {
  return {
    params: Promise.resolve({ phone }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/conversaciones/[phone]/context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 400 si no hay tenant_id en el JWT', async () => {
    const token = makeJwt({ role: 'receptionist' }) // sin tenant_id
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('tenant_id')
  })

  it('llama a FastAPIClient con el path correcto para el tenant y phone', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const mockContext = {
      patient_name: 'Juan Pérez',
      phone_number: '+5491111111111',
      detected_intent: 'agendar_turno',
    }
    mockFastAPIRequest.mockResolvedValue(mockContext)

    const res = await GET(makeRequest('+5491111111111'), makeContext('+5491111111111'))

    expect(res.status).toBe(200)
    expect(mockFastAPIRequest).toHaveBeenCalledWith(
      '/api/v1/tenants/tenant-uuid-1234/conversations/+5491111111111/context'
    )
    const body = await res.json()
    expect(body.context).toEqual(mockContext)
  })

  it('retorna { context: null } con status 200 cuando FastAPI falla (FastAPIError)', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    // Simular un error de FastAPI (404, timeout, etc.)
    mockFastAPIRequest.mockRejectedValue(new Error('FastAPI request failed'))

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toBeNull()
  })

  it('retorna { context: AgentContext } cuando FastAPI responde correctamente', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const agentContext = {
      patient_name: 'María García',
      phone_number: '+5491122334455',
      detected_intent: 'cancelar_turno',
      dni: '30123456',
      service_requested: 'Kinesiología',
      slot_requested: '2026-05-15T10:00:00',
      availability_info: null,
      obra_social: 'OSDE',
      current_block: null,
      is_resolved: false,
    }
    mockFastAPIRequest.mockResolvedValue(agentContext)

    const res = await GET(makeRequest('+5491122334455'), makeContext('+5491122334455'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toEqual(agentContext)
  })
})

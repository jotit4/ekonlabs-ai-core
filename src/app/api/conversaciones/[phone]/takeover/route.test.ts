import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted — factories de mock
const { mockGetUser, mockGetSession, mockFastAPIRequest, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFastAPIRequest: vi.fn(),
  mockLogAudit: vi.fn(),
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

// Mock logAudit
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

import { POST } from './route'
import { FastAPIError } from '@/lib/fastapi/client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeRequest(phone: string = '+5491111111111') {
  return new Request(`http://localhost/api/conversaciones/${phone}/takeover`, { method: 'POST' })
}

function makeContext(phone: string = '+5491111111111') {
  return {
    params: Promise.resolve({ phone }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/conversaciones/[phone]/takeover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogAudit.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retorna 401 si no hay sesión activa', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 400 si no hay tenant_id en el JWT', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    const token = makeJwt({ role: 'receptionist' }) // sin tenant_id
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('tenant_id')
  })

  it('retorna 503 si FASTAPI_API_KEY no está definida y FASTAPI_BASE_URL sí (A-04)', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    // NO stubear FASTAPI_API_KEY — debe retornar 503
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('FastAPI no configurado')
  })

  it('con stub de dev (sin FASTAPI_BASE_URL), retorna { status: ok } con 200', async () => {
    // Sin stubEnv — FASTAPI_BASE_URL no está definida
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    // También registra audit en stub
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'conversation_takeover',
        entity_type: 'conversation',
        entity_id: '+5491111111111',
      })
    )
  })

  it('con autenticación válida, llama a FastAPIClient con path y método correcto', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockFastAPIRequest.mockResolvedValue({ status: 'ok' })

    const res = await POST(makeRequest('+5491111111111'), makeContext('+5491111111111'))

    expect(res.status).toBe(200)
    expect(mockFastAPIRequest).toHaveBeenCalledWith(
      '/api/v1/tenants/tenant-uuid-1234/conversations/+5491111111111/takeover',
      { method: 'POST' }
    )
  })

  it('cuando FastAPI retorna 409 (conflicto), retorna 409 con { error: conflict }', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    // Usar la clase FastAPIError del módulo mockeado para que instanceof funcione
    const conflictError = new FastAPIError('FastAPI request failed', 409, { controlled_by: 'operador-2' })
    mockFastAPIRequest.mockRejectedValue(conflictError)

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('conflict')
  })

  it('cuando FastAPI falla (FastAPIError genérico), retorna 503', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const serverError = new FastAPIError('FastAPI request failed', 503, null)
    mockFastAPIRequest.mockRejectedValue(serverError)

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('takeover_failed')
  })

  it('llama a logAudit con conversation_takeover cuando FastAPI responde OK', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockFastAPIRequest.mockResolvedValue({ status: 'ok' })

    await POST(makeRequest('+5491111111111'), makeContext('+5491111111111'))

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'conversation_takeover',
        entity_type: 'conversation',
        entity_id: '+5491111111111',
      })
    )
  })
})

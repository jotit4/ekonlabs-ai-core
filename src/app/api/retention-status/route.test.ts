import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockFastAPIClientRequest } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFastAPIClientRequest: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
    })
  ),
}))

vi.mock('@/lib/fastapi/client', () => ({
  FastAPIClient: class FastAPIClient {
    request: typeof mockFastAPIClientRequest
    constructor() {
      this.request = mockFastAPIClientRequest
    }
  },
  FastAPIError: class FastAPIError extends Error {
    status: number
    body: unknown
    constructor(message: string, status: number, body: unknown) {
      super(message)
      this.name = 'FastAPIError'
      this.status = status
      this.body = body
    }
  },
}))

import { GET } from './route'
import { FastAPIError } from '@/lib/fastapi/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { app_role: 'admin', tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const adminToken = makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' })
const receptionistToken = makeJwt({ app_role: 'receptionist', tenant_id: 'tenant-1' })

const sampleRetentionData = {
  last_run_at: '2026-05-12T03:00:00Z',
  next_run_at: '2026-05-13T03:00:00Z',
  status: 'ok' as const,
  records_purged_last_run: 42,
  error_message: null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/retention-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const response = await GET()
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBeTruthy()
  })

  it('retorna 403 si el usuario no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: receptionistToken } },
    })

    const response = await GET()
    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body.error).toBeTruthy()
  })

  it('retorna 503 si FASTAPI_BASE_URL no está definida (A-05)', async () => {
    // FASTAPI_BASE_URL no está definida (sin vi.stubEnv)
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: adminToken } },
    })

    const response = await GET()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe('FastAPI no configurado')
  })

  it('retorna { status: "ok", data: ... } cuando FastAPI responde correctamente', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: adminToken } },
    })
    mockFastAPIClientRequest.mockResolvedValue(sampleRetentionData)

    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.data).toEqual(sampleRetentionData)
  })

  it('retorna { status: "degraded", data: null } cuando FastAPI lanza FastAPIError (non-404)', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: adminToken } },
    })
    mockFastAPIClientRequest.mockRejectedValue(
      new FastAPIError('Server error', 500, null)
    )

    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('degraded')
    expect(body.data).toBeNull()
    expect(body.message).toBeDefined()
  })

  it('retorna { status: "degraded", data: null } cuando FastAPI lanza AbortError (timeout)', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: adminToken } },
    })
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFastAPIClientRequest.mockRejectedValue(abortError)

    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('degraded')
    expect(body.data).toBeNull()
  })

  it('retorna { status: "not_implemented", data: null } cuando FastAPI retorna 404', async () => {
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: adminToken } },
    })
    mockFastAPIClientRequest.mockRejectedValue(
      new FastAPIError('Not found', 404, null)
    )

    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('not_implemented')
    expect(body.data).toBeNull()
  })
})

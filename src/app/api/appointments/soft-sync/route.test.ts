import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted runs before any vi.mock hoisting — use this for variables referenced in mock factories
const { mockGetUser, mockGetSession, mockFastapiRequest } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFastapiRequest: vi.fn(),
}))

// Mock server-only — prevents the "server-only" throw in jsdom
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

// Mock FastAPIClient as a proper class constructor
vi.mock('@/lib/fastapi/client', () => {
  class FastAPIClient {
    request = mockFastapiRequest
  }
  class FastAPIError extends Error {
    status: number
    body: unknown
    constructor(message: string, status: number, body: unknown) {
      super(message)
      this.name = 'FastAPIError'
      this.status = status
      this.body = body
    }
  }
  return { FastAPIClient, FastAPIError }
})

import { POST } from './route'
import { FastAPIError } from '@/lib/fastapi/client'

// Helper: build a valid JWT-like token with tenant_id claim
function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_PATIENT_ID = '11111111-2222-3333-4444-555555555555'
const VALID_TENANT_ID = 'tenant-uuid-1234'

// Helper: build a mock Request
function makeRequest(body: unknown = { patient_id: VALID_PATIENT_ID }) {
  return new Request('http://localhost/api/appointments/soft-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/appointments/soft-sync', () => {
  const originalFastapiUrl = process.env.FASTAPI_BASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: authenticated user with valid session and tenant_id
    const token = makeJwt({ tenant_id: VALID_TENANT_ID })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    // Default: FASTAPI_BASE_URL is set so the stub doesn't activate
    process.env.FASTAPI_BASE_URL = 'http://fastapi.local'
    process.env.FASTAPI_API_KEY = 'test-key'
  })

  afterEach(() => {
    // Restore original env
    if (originalFastapiUrl === undefined) {
      delete process.env.FASTAPI_BASE_URL
    } else {
      process.env.FASTAPI_BASE_URL = originalFastapiUrl
    }
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 400 si patient_id está ausente en el body', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/patient_id/i)
  })

  it('retorna 400 si patient_id no es un UUID válido', async () => {
    const res = await POST(makeRequest({ patient_id: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/uuid/i)
  })

  it('retorna 202 { status: "pending" } cuando FastAPI responde 202 (job encolado)', async () => {
    mockFastapiRequest.mockResolvedValue({ status: 'pending', job_id: 'rq-job-123' })

    const res = await POST(makeRequest())
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('retorna 200 { status: "completed" } cuando FastAPI responde 200 (sync inmediato)', async () => {
    mockFastapiRequest.mockResolvedValue({ status: 'completed', affected_dates: ['2026-05-09'] })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('completed')
  })

  it('retorna 200 { status: "not_found" } cuando FastAPI responde 404', async () => {
    mockFastapiRequest.mockRejectedValue(new FastAPIError('not found', 404, null))

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('not_found')
  })

  it('retorna 503 { status: "error" } cuando FastAPI falla (timeout o error de red)', async () => {
    mockFastapiRequest.mockRejectedValue(new Error('fetch failed'))

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.message).toBe('sync_unavailable')
  })

  it('el tenant_id se toma del JWT — nunca del body del cliente', async () => {
    const jwtTenantId = 'jwt-tenant-id-from-token'
    const token = makeJwt({ tenant_id: jwtTenantId })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockFastapiRequest.mockResolvedValue({ status: 'completed' })

    // Send body with a different tenant_id — should be ignored
    const req = new Request('http://localhost/api/appointments/soft-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_id: VALID_PATIENT_ID, tenant_id: 'client-provided-tenant' }),
    })

    await POST(req)

    // FastAPI should be called with tenant_id from JWT, not from body
    expect(mockFastapiRequest).toHaveBeenCalledWith(
      '/api/v1/appointments/soft-sync',
      expect.objectContaining({
        body: expect.stringContaining(jwtTenantId),
      })
    )
    // The client-provided tenant_id should not appear in the FastAPI call body
    const callBody = mockFastapiRequest.mock.calls[0][1].body as string
    expect(callBody).not.toContain('client-provided-tenant')
  })

  it('stub dev — retorna 202 { status: "pending" } si FASTAPI_BASE_URL es undefined', async () => {
    delete process.env.FASTAPI_BASE_URL

    const res = await POST(makeRequest())
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe('pending')

    // FastAPI client should NOT be called — stub short-circuits
    expect(mockFastapiRequest).not.toHaveBeenCalled()
  })
})

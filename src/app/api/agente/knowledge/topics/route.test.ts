import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockGetUser, mockGetSession, mockParseJwt, mockRequest } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockParseJwt: vi.fn(),
  mockRequest: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser, getSession: mockGetSession } }),
  ),
}))
vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))
vi.mock('@/lib/fastapi/client', () => {
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
  class FastAPIClient {
    request = mockRequest
  }
  return { FastAPIClient, FastAPIError }
})

import { FastAPIError } from '@/lib/fastapi/client'

const TENANT_ID = '5298fcc5-15bf-494c-9655-b49d759cfef4'
const OTHER_TENANT = '11111111-1111-1111-1111-111111111111'

const TOPIC = {
  source_filename: 'obras-sociales',
  chunk_count: 3,
  content: 'OSDE se acepta. Swiss Medical se acepta.',
  updated_at: '2026-06-04T00:00:00Z',
}

function setupAuth(role: string, tenantId: string = TENANT_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id: `${role}-uuid` } }, error: null })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockParseJwt.mockReturnValue({ app_role: role, tenant_id: tenantId })
}

function setEnv(on: boolean) {
  if (on) {
    process.env.FASTAPI_BASE_URL = 'http://backend.test'
    process.env.FASTAPI_API_KEY = 'k'
  } else {
    delete process.env.FASTAPI_BASE_URL
    delete process.env.FASTAPI_API_KEY
  }
}

import { GET } from './route'

const ORIGINAL_ENV = { ...process.env }

describe('GET /api/agente/knowledge/topics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('403 si el rol no está permitido', async () => {
    setupAuth('superuser')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it.each(['admin', 'doctor', 'receptionist'])(
    '200 con la lista de temas para %s y usa el tenant del JWT',
    async (role) => {
      setupAuth(role)
      mockRequest.mockResolvedValue({ topics: [TOPIC] })
      const res = await GET()
      expect(res.status).toBe(200)
      const body = (await res.json()) as { topics: unknown[] }
      expect(body.topics).toEqual([TOPIC])
      expect(mockRequest).toHaveBeenCalledWith(
        `/api/v1/tenants/${TENANT_ID}/knowledge/topics`,
      )
    },
  )

  it('usa el tenant del JWT, no uno inyectado', async () => {
    setupAuth('admin', OTHER_TENANT)
    mockRequest.mockResolvedValue({ topics: [] })
    await GET()
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${OTHER_TENANT}/knowledge/topics`,
    )
  })

  it('sin env → 200 con lista vacía y NO llama al backend', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { topics: unknown[] }
    expect(body.topics).toEqual([])
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await GET()
    expect(res.status).toBe(502)
  })

  it('timeout/red → 503', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const res = await GET()
    expect(res.status).toBe(503)
  })
})

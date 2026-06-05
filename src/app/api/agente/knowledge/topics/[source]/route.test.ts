import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockGetUser, mockGetSession, mockParseJwt, mockRequest, mockLogAudit } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetSession: vi.fn(),
    mockParseJwt: vi.fn(),
    mockRequest: vi.fn(),
    mockLogAudit: vi.fn(),
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
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))
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
const SOURCE = 'obras-sociales'
const ENCODED = encodeURIComponent(SOURCE)

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

function makeReq(method: string, body?: unknown): Request {
  return new Request(`http://localhost/api/agente/knowledge/topics/${ENCODED}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(source: string) {
  return { params: Promise.resolve({ source }) }
}

import { PUT, DELETE } from './route'

const ORIGINAL_ENV = { ...process.env }

describe('PUT /api/agente/knowledge/topics/[source]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx(SOURCE))
    expect(res.status).toBe(401)
  })

  it('403 para doctor', async () => {
    setupAuth('doctor')
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx(SOURCE))
    expect(res.status).toBe(403)
  })

  it('400 si el source está vacío', async () => {
    setupAuth('admin')
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx('   '))
    expect(res.status).toBe(400)
  })

  it('400 si el source tiene caracteres de control', async () => {
    setupAuth('admin')
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx('mal\nfeo'))
    expect(res.status).toBe(400)
  })

  it('400 si el source supera 120 chars', async () => {
    setupAuth('admin')
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx('a'.repeat(121)))
    expect(res.status).toBe(400)
  })

  it('400 si el body no trae content', async () => {
    setupAuth('admin')
    const res = await PUT(makeReq('PUT', {}), ctx(SOURCE))
    expect(res.status).toBe(400)
  })

  it('200 + logAudit(kb_topic_reindexed) y path con tenant del JWT + source encodeado', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue({ source_filename: SOURCE, chunk_count: 2, status: 'ok' })
    const res = await PUT(makeReq('PUT', { content: 'nuevo texto' }), ctx(SOURCE))
    expect(res.status).toBe(200)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/topics/${ENCODED}`,
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'kb_topic_reindexed',
        entity_type: 'knowledge',
        entity_id: SOURCE,
      }),
    )
  })

  it('source con caracteres especiales (URL-encodea correctamente)', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue({ status: 'ok' })
    const special = 'obras sociales/2026'
    await PUT(makeReq('PUT', { content: 'x' }), ctx(encodeURIComponent(special)))
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/topics/${encodeURIComponent(special)}`,
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: special }),
    )
  })

  it('5xx del backend → 502 y NO loguea audit', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx(SOURCE))
    expect(res.status).toBe(502)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('sin env → 503 y NO llama al backend', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await PUT(makeReq('PUT', { content: 'x' }), ctx(SOURCE))
    expect(res.status).toBe(503)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/agente/knowledge/topics/[source]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(401)
  })

  it('403 para doctor', async () => {
    setupAuth('doctor')
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(403)
  })

  it('400 si el source es inválido (vacío)', async () => {
    setupAuth('admin')
    const res = await DELETE(makeReq('DELETE'), ctx('   '))
    expect(res.status).toBe(400)
  })

  it('200 + logAudit(kb_topic_deleted) y path con tenant del JWT', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue({ status: 'deleted', source_filename: SOURCE })
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(200)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/topics/${ENCODED}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'kb_topic_deleted',
        entity_type: 'knowledge',
        entity_id: SOURCE,
      }),
    )
  })

  it('tolera null del backend (204) → 200 { ok: true }', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue(null)
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('5xx del backend → 502 y NO loguea audit', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(502)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('sin env → 503 y NO llama al backend', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await DELETE(makeReq('DELETE'), ctx(SOURCE))
    expect(res.status).toBe(503)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

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
const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ENTRY = {
  id: ID,
  content: 'editado',
  source_filename: 'general',
  chunk_index: 0,
  created_at: '2026-06-04T00:00:00Z',
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

function makeReq(method: string, body?: unknown): Request {
  return new Request(`http://localhost/api/agente/knowledge/${ID}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

import { PATCH, DELETE } from './route'

const ORIGINAL_ENV = { ...process.env }

describe('PATCH /api/agente/knowledge/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx(ID))
    expect(res.status).toBe(401)
  })

  it('403 para doctor', async () => {
    setupAuth('doctor')
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx(ID))
    expect(res.status).toBe(403)
  })

  it('400 si el id no es UUID', async () => {
    setupAuth('admin')
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx('no-es-uuid'))
    expect(res.status).toBe(400)
  })

  it('400 si el body no trae ningún campo', async () => {
    setupAuth('admin')
    const res = await PATCH(makeReq('PATCH', {}), ctx(ID))
    expect(res.status).toBe(400)
  })

  it('200 con la entrada y llama al path con tenant del JWT', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue(ENTRY)
    const res = await PATCH(makeReq('PATCH', { content: 'editado' }), ctx(ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as typeof ENTRY
    expect(body).toEqual(ENTRY)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/${ID}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('404 del backend → 404 del dashboard', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('not found', 404, null))
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx(ID))
    expect(res.status).toBe(404)
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx(ID))
    expect(res.status).toBe(502)
  })

  it('sin env → 503', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await PATCH(makeReq('PATCH', { content: 'x' }), ctx(ID))
    expect(res.status).toBe(503)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/agente/knowledge/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(401)
  })

  it('403 para doctor', async () => {
    setupAuth('doctor')
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(403)
  })

  it('400 si el id no es UUID', async () => {
    setupAuth('admin')
    const res = await DELETE(makeReq('DELETE'), ctx('bad'))
    expect(res.status).toBe(400)
  })

  it('200 { ok: true } en éxito, tolerando null (204 del backend)', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue(null)
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/${ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('404 del backend → 404', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('not found', 404, null))
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(404)
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(502)
  })

  it('sin env → 503', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await DELETE(makeReq('DELETE'), ctx(ID))
    expect(res.status).toBe(503)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── vi.hoisted — referenciado en factories de vi.mock ─────────────────────────

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
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
    }),
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

// FastAPIClient mockeado — nunca llama al backend real.
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

const ENTRY = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  content: 'OSDE se acepta',
  source_filename: 'obras-sociales',
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

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/agente/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Importado tras los mocks.
import { GET, POST } from './route'

const ORIGINAL_ENV = { ...process.env }

describe('GET /api/agente/knowledge', () => {
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

  it('400 si falta tenant_id en el JWT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it.each(['admin', 'doctor', 'receptionist'])(
    '200 con la lista para rol %s y llama al path con el tenant del JWT',
    async (role) => {
      setupAuth(role)
      mockRequest.mockResolvedValue({ entries: [ENTRY] })
      const res = await GET()
      expect(res.status).toBe(200)
      const body = (await res.json()) as { entries: unknown[] }
      expect(body.entries).toEqual([ENTRY])
      expect(mockRequest).toHaveBeenCalledWith(`/api/v1/tenants/${TENANT_ID}/knowledge`)
    },
  )

  it('usa el tenant del JWT, no uno inyectado (el JWT manda)', async () => {
    setupAuth('admin', OTHER_TENANT)
    mockRequest.mockResolvedValue({ entries: [] })
    await GET()
    expect(mockRequest).toHaveBeenCalledWith(`/api/v1/tenants/${OTHER_TENANT}/knowledge`)
    expect(mockRequest).not.toHaveBeenCalledWith(`/api/v1/tenants/${TENANT_ID}/knowledge`)
  })

  it('sin env → 200 con lista vacía (degradación suave) y NO llama al backend', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[] }
    expect(body.entries).toEqual([])
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await GET()
    expect(res.status).toBe(502)
  })

  it('timeout/red → 503 knowledge_unavailable', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('knowledge_unavailable')
  })
})

describe('POST /api/agente/knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePost({ content: 'x' }))
    expect(res.status).toBe(401)
  })

  it('403 para doctor (sólo lectura)', async () => {
    setupAuth('doctor')
    const res = await POST(makePost({ content: 'x' }))
    expect(res.status).toBe(403)
  })

  it('400 si content vacío', async () => {
    setupAuth('admin')
    const res = await POST(makePost({ content: '   ' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; details: unknown }
    expect(body.details).toBeDefined()
  })

  it('400 si content > 5000 chars', async () => {
    setupAuth('admin')
    const res = await POST(makePost({ content: 'a'.repeat(5001) }))
    expect(res.status).toBe(400)
  })

  it.each(['admin', 'receptionist'])('201 con la entrada creada para %s', async (role) => {
    setupAuth(role)
    mockRequest.mockResolvedValue(ENTRY)
    const res = await POST(makePost({ content: 'OSDE se acepta', source_filename: 'obras-sociales' }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as typeof ENTRY
    expect(body).toEqual(ENTRY)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('source_filename por defecto "general" si se omite', async () => {
    setupAuth('admin')
    mockRequest.mockResolvedValue(ENTRY)
    await POST(makePost({ content: 'sin tema' }))
    const [, init] = mockRequest.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ content: 'sin tema', source_filename: 'general' })
  })

  it('ignora tenant_id inyectado en el body (usa el del JWT)', async () => {
    setupAuth('admin', TENANT_ID)
    mockRequest.mockResolvedValue(ENTRY)
    await POST(makePost({ content: 'x', tenant_id: OTHER_TENANT }))
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge`,
      expect.anything(),
    )
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 503, null))
    const res = await POST(makePost({ content: 'x' }))
    expect(res.status).toBe(502)
  })

  it('timeout/red → 503', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const res = await POST(makePost({ content: 'x' }))
    expect(res.status).toBe(503)
  })

  it('sin env → 503 knowledge_unavailable (no inventa escritura)', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await POST(makePost({ content: 'x' }))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('knowledge_unavailable')
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

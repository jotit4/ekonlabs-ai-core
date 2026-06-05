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

const PROPOSAL = {
  suggested_topic: 'obras-sociales',
  is_new_topic: false,
  current_text: 'OSDE se acepta',
  proposed_text: 'OSDE y Swiss Medical se aceptan',
  gap_questions: ['¿Aceptan Galeno?'],
  contradiction_warning: null,
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
  return new Request('http://localhost/api/agente/knowledge/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

describe('POST /api/agente/knowledge/propose', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(true)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePost({ correction_note: 'x' }))
    expect(res.status).toBe(401)
  })

  it('403 para doctor (sólo lectura)', async () => {
    setupAuth('doctor')
    const res = await POST(makePost({ correction_note: 'x' }))
    expect(res.status).toBe(403)
  })

  it('400 si falta correction_note', async () => {
    setupAuth('admin')
    const res = await POST(makePost({ patient_question: '¿Aceptan OSDE?' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; details: unknown }
    expect(body.details).toBeDefined()
  })

  it('400 si correction_note vacío tras trim', async () => {
    setupAuth('admin')
    const res = await POST(makePost({ correction_note: '   ' }))
    expect(res.status).toBe(400)
  })

  it('sin env → 503 knowledge_unavailable y NO llama al backend', async () => {
    setupAuth('admin')
    setEnv(false)
    const res = await POST(makePost({ correction_note: 'x' }))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('knowledge_unavailable')
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it.each(['admin', 'receptionist'])('200 con la propuesta para %s', async (role) => {
    setupAuth(role)
    mockRequest.mockResolvedValue(PROPOSAL)
    const res = await POST(
      makePost({ correction_note: 'agregar Swiss Medical', target_topic: 'obras-sociales' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as typeof PROPOSAL
    expect(body).toEqual(PROPOSAL)
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${TENANT_ID}/knowledge/propose`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('usa el tenant del JWT, no uno inyectado', async () => {
    setupAuth('admin', OTHER_TENANT)
    mockRequest.mockResolvedValue(PROPOSAL)
    await POST(makePost({ correction_note: 'x', tenant_id: TENANT_ID }))
    expect(mockRequest).toHaveBeenCalledWith(
      `/api/v1/tenants/${OTHER_TENANT}/knowledge/propose`,
      expect.anything(),
    )
  })

  it('5xx del backend → 502', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new FastAPIError('fail', 500, null))
    const res = await POST(makePost({ correction_note: 'x' }))
    expect(res.status).toBe(502)
  })

  it('timeout/red → 503', async () => {
    setupAuth('admin')
    mockRequest.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const res = await POST(makePost({ correction_note: 'x' }))
    expect(res.status).toBe(503)
  })
})

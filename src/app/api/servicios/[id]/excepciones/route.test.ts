import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted ─────────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))

import { GET, POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/servicios/svc-1/excepciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

function makeInsertSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const SAMPLE_EXCEPTION = {
  exception_id: 'exc-uuid-1',
  service_id: 'svc-1',
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  exception_date: '2026-12-25',
  reason: 'Navidad',
  created_at: '2026-05-13T00:00:00Z',
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/servicios/[id]/excepciones', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeParams('svc-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET(new Request('http://localhost'), makeParams('svc-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 200 con lista de excepciones futuras', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_EXCEPTION], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('svc-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_EXCEPTION[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].exception_id).toBe('exc-uuid-1')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET(new Request('http://localhost'), makeParams('svc-1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener excepciones')
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/servicios/[id]/excepciones', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePostRequest({ exception_date: '2026-12-25' }), makeParams('svc-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await POST(makePostRequest({ exception_date: '2026-12-25' }), makeParams('svc-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 400 si formato de fecha inválido', async () => {
    setupAdminAuth()

    const res = await POST(makePostRequest({ exception_date: '25/12/2026' }), makeParams('svc-1'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 201 con excepción creada', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_EXCEPTION, error: null }))

    const res = await POST(
      makePostRequest({ exception_date: '2026-12-25', reason: 'Navidad' }),
      makeParams('svc-1')
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_EXCEPTION }
    expect(body.data.exception_id).toBe('exc-uuid-1')
  })

  it('retorna 409 cuando ya existe excepción para esa fecha (UNIQUE violation)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(
      makeInsertSelectSingleChain({ data: null, error: { code: '23505', message: 'duplicate' } })
    )

    const res = await POST(makePostRequest({ exception_date: '2026-12-25' }), makeParams('svc-1'))
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Ya existe una excepción para esa fecha')
  })

  it('retorna 500 si Supabase falla con otro error', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(
      makeInsertSelectSingleChain({ data: null, error: { code: '42P01', message: 'DB error' } })
    )

    const res = await POST(makePostRequest({ exception_date: '2026-12-25' }), makeParams('svc-1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al crear la excepción')
  })
})

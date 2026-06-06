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

function setupReceptionistAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'receptionist',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/profesionales/prof-1/bloqueos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

// Doctor logueado. dashboard_users devolverá el professional_id que se mockee.
function setupDoctorAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'doctor',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

// Cadena dashboard_users.select().eq().single() usada por authorizeProfessionalAccess
function makeDashboardUserChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const SAMPLE_BLOCKED = {
  block_id: 'block-uuid-1',
  professional_id: 'prof-1',
  date_from: '2026-07-01',
  date_to: '2026-07-14',
  reason: 'Vacaciones',
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/profesionales/[id]/bloqueos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no es admin/receptionist/doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'x-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'patient', tenant_id: 'tenant-1' })

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 200 para doctor sobre su propio professional_id', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-1' }, error: null }))
    mockFrom.mockReturnValueOnce(makeSelectChain({ data: [SAMPLE_BLOCKED], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_BLOCKED[] }
    expect(body.data).toHaveLength(1)
  })

  it('retorna 403 para doctor sobre el professional_id de OTRO profesional', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-OTHER' }, error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 403 para doctor sin professional_id asignado', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: null }, error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 200 para receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'header.payload.sig' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_BLOCKED], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(200)
  })

  it('retorna 200 con { data: BlockedTime[] }', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_BLOCKED], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_BLOCKED[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].block_id).toBe('block-uuid-1')
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/profesionales/[id]/bloqueos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 400 si body inválido (date_to < date_from)', async () => {
    setupAdminAuth()

    const res = await POST(
      makePostRequest({ date_from: '2026-07-14', date_to: '2026-07-01' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 201 con bloqueo creado para datos válidos', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_BLOCKED, error: null }))

    const res = await POST(
      makePostRequest({ date_from: '2026-07-01', date_to: '2026-07-14', reason: 'Vacaciones' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_BLOCKED }
    expect(body.data.block_id).toBe('block-uuid-1')
  })

  it('retorna 201 para receptionist con datos válidos', async () => {
    setupReceptionistAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_BLOCKED, error: null }))

    const res = await POST(
      makePostRequest({ date_from: '2026-07-01', date_to: '2026-07-14', reason: 'Vacaciones' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(201)
  })

  it('retorna 201 para doctor sobre su propio professional_id', async () => {
    setupDoctorAuth()
    // 1ra llamada: dashboard_users → professional_id propio == id de la URL
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-1' }, error: null }))
    // 2da llamada: insert
    mockFrom.mockReturnValueOnce(makeInsertSelectSingleChain({ data: SAMPLE_BLOCKED, error: null }))

    const res = await POST(
      makePostRequest({ date_from: '2026-07-01', date_to: '2026-07-14', reason: 'Vacaciones' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(201)
  })

  it('retorna 403 para doctor sobre el professional_id de OTRO profesional', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-OTHER' }, error: null }))

    const res = await POST(
      makePostRequest({ date_from: '2026-07-01', date_to: '2026-07-14', reason: 'Vacaciones' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(403)
  })

  it('retorna 403 para doctor sin professional_id asignado', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: null }, error: null }))

    const res = await POST(
      makePostRequest({ date_from: '2026-07-01', date_to: '2026-07-14', reason: 'Vacaciones' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(403)
  })
})

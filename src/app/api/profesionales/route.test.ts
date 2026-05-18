import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted ─────────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockAdminFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
  mockAdminFrom: vi.fn(),
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

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
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

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/profesionales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Cadena para SELECT con order()
function makeSelectOrderChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

// Cadena para INSERT con .select().single()
function makeInsertSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const SAMPLE_PROFESSIONAL = {
  professional_id: 'prof-uuid-1',
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  name: 'Dr. López',
  email: 'lopez@clinica.com',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  service_professionals: [],
}

// Helper para el admin chain de linked users (GET /api/profesionales usa admin para dashboard_users)
function makeAdminLinkedUsersChain(linkedUsers: { professional_id: string; email: string }[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: linkedUsers, error: null }),
  }
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/profesionales', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 200 con lista de profesionales para admin', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: [SAMPLE_PROFESSIONAL], error: null }))
    mockAdminFrom.mockReturnValue(makeAdminLinkedUsersChain([]))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toHaveLength(1)
  })

  it('retorna 200 con lista de profesionales para receptionist', async () => {
    setupReceptionistAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: [SAMPLE_PROFESSIONAL], error: null }))
    mockAdminFrom.mockReturnValue(makeAdminLinkedUsersChain([]))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toHaveLength(1)
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('retorna linked_user_email cuando el profesional tiene usuario vinculado', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: [SAMPLE_PROFESSIONAL], error: null }))
    mockAdminFrom.mockReturnValue(
      makeAdminLinkedUsersChain([{ professional_id: 'prof-uuid-1', email: 'garcia@login.com' }])
    )

    const res = await GET()
    const body = await res.json() as { data: Array<{ linked_user_email: string | null }> }
    expect(body.data[0].linked_user_email).toBe('garcia@login.com')
  })

  it('retorna linked_user_email: null cuando el profesional no tiene usuario vinculado', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: [SAMPLE_PROFESSIONAL], error: null }))
    mockAdminFrom.mockReturnValue(makeAdminLinkedUsersChain([]))

    const res = await GET()
    const body = await res.json() as { data: Array<{ linked_user_email: string | null }> }
    expect(body.data[0].linked_user_email).toBeNull()
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/profesionales', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePostRequest({ name: 'Dr. Test', email: 'test@test.com' }))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await POST(makePostRequest({ name: 'Dr. Test', email: 'test@test.com' }))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si body inválido', async () => {
    setupAdminAuth()
    const res = await POST(makePostRequest({ name: '' }))
    expect(res.status).toBe(400)
  })

  it('retorna 201 al crear profesional como admin', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_PROFESSIONAL, error: null }))

    const res = await POST(makePostRequest({ name: 'Dr. López', email: 'lopez@clinica.com' }))
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_PROFESSIONAL }
    expect(body.data.professional_id).toBe('prof-uuid-1')
  })

  it('retorna 201 al crear profesional como receptionist', async () => {
    setupReceptionistAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_PROFESSIONAL, error: null }))

    const res = await POST(makePostRequest({ name: 'Dr. López', email: 'lopez@clinica.com' }))
    expect(res.status).toBe(201)
  })

  it('retorna 409 si email duplicado', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      }),
    })

    const res = await POST(makePostRequest({ name: 'Dr. Test', email: 'dup@clinica.com' }))
    expect(res.status).toBe(409)
  })
})

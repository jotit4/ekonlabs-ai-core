import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
}))

// Mock server-only
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
      from: mockFrom,
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mock de cadena de Supabase para la query .from().select().not().order()
function makeSelectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
  return chain
}

// ── Setup por defecto ────────────────────────────────────────────────────────

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid-1' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIiwidGVuYW50X2lkIjoiNTI5OGZjYzUtMTViZi00OTRjLTk2NTUtYjQ5ZDc1OWNmZWY0In0.sig',
      },
    },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/patients/deletion-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'doctor-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'rec-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 200 con { data: [] } cuando no hay solicitudes pendientes', async () => {
    setupAdminAuth()

    const selectChain = makeSelectChain({ data: [], error: null })
    mockFrom.mockReturnValue(selectChain)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it('retorna 200 con lista de solicitudes cuando existen pacientes con deletion_requested_at', async () => {
    setupAdminAuth()

    const now = new Date()
    const futureDate = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()
    const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const requestedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

    const selectChain = makeSelectChain({
      data: [
        {
          patient_id: 'p1',
          full_name: 'Juan Pérez',
          dni: '12345678',
          deletion_requested_at: requestedAt,
          deletion_effective_at: futureDate,
        },
        {
          patient_id: 'p2',
          full_name: 'Ana García',
          dni: null,
          deletion_requested_at: requestedAt,
          deletion_effective_at: pastDate,
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(selectChain)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ patient_id: string; status: string }> }
    expect(body.data).toHaveLength(2)
    expect(body.data[0].patient_id).toBe('p1')
    expect(body.data[1].patient_id).toBe('p2')
  })

  it("retorna status 'pending' cuando deletion_effective_at > ahora", async () => {
    setupAdminAuth()

    const now = new Date()
    const futureDate = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()
    const requestedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

    const selectChain = makeSelectChain({
      data: [
        {
          patient_id: 'p1',
          full_name: 'Juan Pérez',
          dni: '12345678',
          deletion_requested_at: requestedAt,
          deletion_effective_at: futureDate,
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(selectChain)

    const res = await GET()
    const body = await res.json() as { data: Array<{ status: string }> }
    expect(body.data[0].status).toBe('pending')
  })

  it("retorna status 'processed' cuando deletion_effective_at <= ahora", async () => {
    setupAdminAuth()

    const now = new Date()
    const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const requestedAt = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString()

    const selectChain = makeSelectChain({
      data: [
        {
          patient_id: 'p2',
          full_name: 'Ana García',
          dni: null,
          deletion_requested_at: requestedAt,
          deletion_effective_at: pastDate,
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(selectChain)

    const res = await GET()
    const body = await res.json() as { data: Array<{ status: string }> }
    expect(body.data[0].status).toBe('processed')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()

    const selectChain = makeSelectChain({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(selectChain)

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener solicitudes')
  })
})

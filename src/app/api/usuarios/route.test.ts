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

// Mock admin para el POST (no lo necesitamos en GET, pero está importado en el módulo)
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: { admin: { inviteUserByEmail: vi.fn(), deleteUser: vi.fn() } },
    from: vi.fn(),
  })),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/schemas/users', () => ({
  createUserSchema: { safeParse: vi.fn() },
}))

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_USERS = [
  {
    id: 'uuid-1',
    user_id: 'user-uuid-1',
    tenant_id: 'tenant-uuid-1',
    role: 'admin',
    is_active: true,
    full_name: 'Admin Usuario',
    email: 'admin@test.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

function makeSelectOrderChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

// ── Tests GET /api/usuarios ───────────────────────────────────────────────────

describe('GET /api/usuarios', () => {
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

  it('retorna 401 si getUser retorna error de auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo admins pueden listar usuarios')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo admins pueden listar usuarios')
  })

  it('retorna 200 con { users } cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIn0.sig' } },
    })
    mockParseJwt.mockReturnValue({
      app_role: 'admin',
      tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
    })
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: SAMPLE_USERS, error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { users: typeof SAMPLE_USERS }
    expect(body.users).toEqual(SAMPLE_USERS)
  })

  it('retorna 500 si Supabase falla en la query', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({
      app_role: 'admin',
      tenant_id: 'tenant-1',
    })
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener usuarios')
  })

  it('NO incluye .eq(tenant_id) en la query — RLS filtra (AR14)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({
      app_role: 'admin',
      tenant_id: 'tenant-1',
    })

    const mockSelectFn = vi.fn().mockReturnThis()
    const mockOrderFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEqFn = vi.fn().mockReturnThis()
    mockFrom.mockReturnValue({
      select: mockSelectFn,
      order: mockOrderFn,
      eq: mockEqFn,
    })

    await GET()

    // No debe llamar .eq con tenant_id
    expect(mockEqFn).not.toHaveBeenCalledWith('tenant_id', expect.anything())
    // Debe llamar .order con created_at ascendente
    expect(mockOrderFn).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

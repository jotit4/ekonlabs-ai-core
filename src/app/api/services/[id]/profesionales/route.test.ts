import { vi, describe, it, expect, beforeEach } from 'vitest'

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
    }),
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))

import { GET } from './route'

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'h.p.s' } } })
  mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
}

// Cadena .select().eq() que resuelve a un resultado
function makeSelectEqChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  }
}

const params = Promise.resolve({ id: 'svc-1' })

describe('GET /api/services/[id]/profesionales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), { params })
    expect(res.status).toBe(401)
  })

  it('403 si el rol no es admin ni receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'h.p.s' } } })
    mockParseJwt.mockReturnValue({ app_role: 'professional', tenant_id: 't' })
    const res = await GET(new Request('http://localhost'), { params })
    expect(res.status).toBe(403)
  })

  it('devuelve sólo profesionales activos, aplanados y ordenados por nombre', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(
      makeSelectEqChain({
        data: [
          { professional_id: 'p2', professionals: { professional_id: 'p2', name: 'Patricia', active: true } },
          { professional_id: 'p1', professionals: { professional_id: 'p1', name: 'Aldo', active: true } },
          { professional_id: 'p3', professionals: { professional_id: 'p3', name: 'Inactivo', active: false } },
          { professional_id: 'p4', professionals: null },
        ],
        error: null,
      }),
    )

    const res = await GET(new Request('http://localhost'), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      { professional_id: 'p1', name: 'Aldo' },
      { professional_id: 'p2', name: 'Patricia' },
    ])
  })

  it('500 si la query falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectEqChain({ data: null, error: { message: 'boom' } }))
    const res = await GET(new Request('http://localhost'), { params })
    expect(res.status).toBe(500)
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())

const mockFrom = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockEq = vi.hoisted(() => vi.fn())
const mockSingle = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

function makeJwt(role: string) {
  return Buffer.from(
    JSON.stringify({ app_role: role, tenant_id: 'tenant-1' })
  ).toString('base64')
}

function setupDoctorAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-doc-1' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: makeJwt('doctor') } },
  })
  mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
}

import { GET } from './route'

describe('GET /api/me/professional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup chain por defecto
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle })
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('retorna 404 si el doctor no tiene professional_id asignado', async () => {
    setupDoctorAuth()
    mockSingle.mockResolvedValue({
      data: { professional_id: null, professionals: null },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Profesional no asignado')
  })

  it('retorna 200 con professional_id y professional_name cuando el doctor tiene perfil', async () => {
    setupDoctorAuth()
    mockSingle.mockResolvedValue({
      data: {
        professional_id: 'prof-uuid-1',
        professionals: { name: 'Dr. García' },
      },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.professional_id).toBe('prof-uuid-1')
    expect(body.data.professional_name).toBe('Dr. García')
  })

  it('retorna 500 si falla la query a dashboard_users', async () => {
    setupDoctorAuth()
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    })

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

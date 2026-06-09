import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())

const mockFrom = vi.hoisted(() => vi.fn())

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

// Helper: a thenable query builder that resolves to `result` and supports
// .select().eq().single() / .select().eq() / .update().eq().select().single()
function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const ret = () => builder
  builder.select = ret
  builder.update = ret
  builder.eq = ret
  builder.single = () => Promise.resolve(result)
  // For chains that end at .eq() (no .single), make it thenable
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return builder
}

// Configure mockFrom to return a sequence of builders by table name.
function setFromMap(map: Record<string, { data: unknown; error: unknown }>) {
  mockFrom.mockImplementation((table: string) => makeBuilder(map[table]))
}

import { GET, PATCH } from './route'

describe('GET /api/me/professional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt('admin') } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Acceso denegado')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt('receptionist') } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('retorna 404 si el doctor no tiene professional_id asignado', async () => {
    setupDoctorAuth()
    setFromMap({
      dashboard_users: { data: { professional_id: null, professionals: null }, error: null },
    })
    const res = await GET()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Profesional no asignado')
  })

  it('retorna 200 con professional_id, name, email y services', async () => {
    setupDoctorAuth()
    setFromMap({
      dashboard_users: {
        data: { professional_id: 'prof-uuid-1', professionals: { name: 'Dr. García', email: 'g@isadi.com' } },
        error: null,
      },
      service_professionals: {
        data: [{ service_id: 'svc-1', services: { name: 'Kinesiología' } }],
        error: null,
      },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.professional_id).toBe('prof-uuid-1')
    expect(body.data.professional_name).toBe('Dr. García')
    expect(body.data.professional_email).toBe('g@isadi.com')
    expect(body.data.services).toEqual([{ service_id: 'svc-1', name: 'Kinesiología' }])
  })

  it('retorna 500 si falla la query a dashboard_users', async () => {
    setupDoctorAuth()
    setFromMap({ dashboard_users: { data: null, error: { message: 'DB error' } } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/me/professional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function patchReq(body: unknown) {
    return new Request('http://t/api/me/professional', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  }

  it('retorna 401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(patchReq({ name: 'Nuevo' }))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt('admin') } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    const res = await PATCH(patchReq({ name: 'Nuevo' }))
    expect(res.status).toBe(403)
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt('receptionist') } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await PATCH(patchReq({ name: 'Nuevo' }))
    expect(res.status).toBe(403)
  })

  it('retorna 400 si el body es inválido (ningún campo)', async () => {
    setupDoctorAuth()
    const res = await PATCH(patchReq({}))
    expect(res.status).toBe(400)
  })

  it('retorna 404 si professional_id es NULL', async () => {
    setupDoctorAuth()
    setFromMap({ dashboard_users: { data: { professional_id: null }, error: null } })
    const res = await PATCH(patchReq({ name: 'Dr. Nuevo' }))
    expect(res.status).toBe(404)
  })

  it('retorna 200 y actualiza name/email', async () => {
    setupDoctorAuth()
    setFromMap({
      dashboard_users: { data: { professional_id: 'prof-1' }, error: null },
      professionals: { data: { professional_id: 'prof-1', name: 'Dr. Nuevo', email: 'n@isadi.com' }, error: null },
    })
    const res = await PATCH(patchReq({ name: 'Dr. Nuevo', email: 'n@isadi.com' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Dr. Nuevo')
    expect(body.data.email).toBe('n@isadi.com')
  })

  it('retorna 409 en unique_violation (email profesional duplicado)', async () => {
    setupDoctorAuth()
    setFromMap({
      dashboard_users: { data: { professional_id: 'prof-1' }, error: null },
      professionals: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    const res = await PATCH(patchReq({ email: 'dup@isadi.com' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ese email profesional ya está en uso')
  })

  it('retorna 500 en otro error de update', async () => {
    setupDoctorAuth()
    setFromMap({
      dashboard_users: { data: { professional_id: 'prof-1' }, error: null },
      professionals: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    const res = await PATCH(patchReq({ name: 'Dr. Nuevo' }))
    expect(res.status).toBe(500)
  })
})

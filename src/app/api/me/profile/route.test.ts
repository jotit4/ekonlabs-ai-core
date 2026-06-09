import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())

const mockFrom = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockEqSelect = vi.hoisted(() => vi.fn())
const mockSingleSelect = vi.hoisted(() => vi.fn())
const mockEqUpdate = vi.hoisted(() => vi.fn())
const mockSelectUpdate = vi.hoisted(() => vi.fn())
const mockSingleUpdate = vi.hoisted(() => vi.fn())

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
  return Buffer.from(JSON.stringify({ app_role: role, tenant_id: 'tenant-1' })).toString('base64')
}

function setupAuth(role = 'admin', email = 'me@isadi.com') {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email } }, error: null })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt(role) } } })
  mockParseJwt.mockReturnValue({ app_role: role, tenant_id: 'tenant-1' })
}

import { GET, PATCH } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  // SELECT chain: from → select → eq → single
  mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate }))
  mockSelect.mockReturnValue({ eq: mockEqSelect })
  mockEqSelect.mockReturnValue({ single: mockSingleSelect })
  // UPDATE chain: from → update → eq → select → single
  mockUpdate.mockReturnValue({ eq: mockEqUpdate })
  mockEqUpdate.mockReturnValue({ select: mockSelectUpdate })
  mockSelectUpdate.mockReturnValue({ single: mockSingleUpdate })
})

describe('GET /api/me/profile', () => {
  it('retorna 401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autorizado')
  })

  it('retorna 200 con full_name, login_email y role', async () => {
    setupAuth('doctor', 'login@isadi.com')
    mockSingleSelect.mockResolvedValue({
      data: { full_name: 'Dr House', email: 'denorm@isadi.com', role: 'doctor' },
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.full_name).toBe('Dr House')
    // login_email es el de Auth (user.email), no la columna denormalizada
    expect(body.data.login_email).toBe('login@isadi.com')
    expect(body.data.role).toBe('doctor')
  })

  it('retorna 500 si falla la query', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/me/profile', () => {
  it('retorna 401 si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(new Request('http://t/api/me/profile', {
      method: 'PATCH', body: JSON.stringify({ full_name: 'Nuevo Nombre' }),
    }))
    expect(res.status).toBe(401)
  })

  it('retorna 400 si full_name tiene menos de 2 caracteres', async () => {
    setupAuth()
    const res = await PATCH(new Request('http://t/api/me/profile', {
      method: 'PATCH', body: JSON.stringify({ full_name: 'A' }),
    }))
    expect(res.status).toBe(400)
  })

  it('retorna 200 y actualiza full_name', async () => {
    setupAuth()
    mockSingleUpdate.mockResolvedValue({ data: { full_name: 'Nuevo Nombre' }, error: null })
    const res = await PATCH(new Request('http://t/api/me/profile', {
      method: 'PATCH', body: JSON.stringify({ full_name: 'Nuevo Nombre' }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.full_name).toBe('Nuevo Nombre')
    expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Nuevo Nombre' })
  })

  it('retorna 500 si falla el update', async () => {
    setupAuth()
    mockSingleUpdate.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const res = await PATCH(new Request('http://t/api/me/profile', {
      method: 'PATCH', body: JSON.stringify({ full_name: 'Nuevo Nombre' }),
    }))
    expect(res.status).toBe(500)
  })
})

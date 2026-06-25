import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

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

import { POST } from './route'

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeContext(phone = '+5491111111111') {
  return { params: Promise.resolve({ phone }) }
}

function makeRequest() {
  return new Request('http://localhost/api/conversaciones/+5491111111111/read', { method: 'POST' })
}

function mockUpsertOk() {
  mockFrom.mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
  })
}

describe('POST /api/conversaciones/[phone]/read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1' })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('400 si no hay tenant_id en el JWT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ role: 'receptionist' }) } } })
    mockParseJwt.mockReturnValue({ role: 'receptionist' }) // sin tenant_id

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('tenant_id')
  })

  it('200 y upsert correcto en happy path', async () => {
    const token = makeJwt({ tenant_id: 'tenant-1' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockUpsertOk()

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('upsert se llama con los campos correctos', async () => {
    const token = makeJwt({ tenant_id: 'tenant-abc' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-xyz' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-abc' })

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: upsertMock })

    await POST(makeRequest(), makeContext('+5499999999'))

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-abc',
        user_id: 'user-xyz',
        phone_number: '+5499999999',
      }),
      { onConflict: 'tenant_id,user_id,phone_number' }
    )
  })

  it('500 si el upsert falla', async () => {
    const token = makeJwt({ tenant_id: 'tenant-1' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(500)
  })
})

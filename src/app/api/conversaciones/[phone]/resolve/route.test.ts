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

function makeRequest(body: unknown = { resolved: true }) {
  return new Request('http://localhost/api/conversaciones/+5491111111111/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockUpsertOk() {
  mockFrom.mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
  })
}

describe('POST /api/conversaciones/[phone]/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1' })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(401)
  })

  it('400 si no hay tenant_id en el JWT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({}) } } })
    mockParseJwt.mockReturnValue({}) // sin tenant_id

    const res = await POST(makeRequest(), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('tenant_id')
  })

  it('400 si "resolved" no es boolean', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })

    const res = await POST(makeRequest({ resolved: 'yes' }), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('boolean')
  })

  it('200 happy path — resolver (resolved=true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })
    mockUpsertOk()

    const res = await POST(makeRequest({ resolved: true }), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('200 happy path — reabrir (resolved=false)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })
    mockUpsertOk()

    const res = await POST(makeRequest({ resolved: false }), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('upsert con resolved=true → resolved_at tiene valor; resolved=false → resolved_at es null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1', name: 'Ana' }) } } })
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1', name: 'Ana' })

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: upsertMock })

    // resolved=true
    await POST(makeRequest({ resolved: true }), makeContext())
    const callArgs = upsertMock.mock.calls[0][0]
    expect(callArgs.resolved_at).not.toBeNull()
    expect(callArgs.resolved_by_user).toBe('user-1')
    expect(callArgs.resolved_by_name).toBe('Ana')

    upsertMock.mockClear()

    // resolved=false
    await POST(makeRequest({ resolved: false }), makeContext())
    const callArgs2 = upsertMock.mock.calls[0][0]
    expect(callArgs2.resolved_at).toBeNull()
    expect(callArgs2.resolved_by_user).toBeNull()
  })

  it('500 si upsert falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    })

    const res = await POST(makeRequest({ resolved: true }), makeContext())

    expect(res.status).toBe(500)
  })
})

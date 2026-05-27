import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
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
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))

import { PATCH } from './route'

function makeJwt(claims: Record<string, unknown> = { tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown = { status: 'cancelled' }) {
  return new Request(`http://localhost/api/appointments/${VALID_UUID}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id = VALID_UUID) {
  return { params: Promise.resolve({ id }) }
}

function makeUpdateChain(error: null | object = null, count: number = 1) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error, count }),
    }),
  }
}

describe('PATCH /api/appointments/[id]/status', () => {
  const validToken = makeJwt({ tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: validToken } },
    })
  })

  it('400 si el id no es UUID válido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest(), makeContext('not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/inválido/i)
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('400 si body es JSON inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const req = new Request(`http://localhost/api/appointments/${VALID_UUID}/status`, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('400 si status no es permitido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({ status: 'confirmed' }), makeContext())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cancelled|completed|no_show/i)
  })

  it('400 si status está ausente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
  })

  it('404 si el turno no existe (count === 0)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 0))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Turno no encontrado')
  })

  it('200 al cancelar un turno (status: cancelled)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('200 al marcar asistencia (status: completed)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'completed' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('200 al marcar no-show (status: no_show)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'no_show' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('500 si hay error de DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain({ message: 'DB error', code: 'PGRST001' }, 0))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(500)
  })
})

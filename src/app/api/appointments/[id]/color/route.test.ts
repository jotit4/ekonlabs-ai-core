import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockLogAudit: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

import { PATCH } from './route'

function makeJwt(claims: Record<string, unknown> = { tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown = { color: '#00FFFF' }) {
  return new Request(`http://localhost/api/appointments/${VALID_UUID}/color`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id = VALID_UUID) {
  return { params: Promise.resolve({ id }) }
}

function makeUpdateChain(error: null | object = null, count: number = 1) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error, count }),
  })
  return { update }
}

describe('PATCH /api/appointments/[id]/color', () => {
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
    const req = new Request(`http://localhost/api/appointments/${VALID_UUID}/color`, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('400 si color no cumple el formato hex', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({ color: 'azul' }), makeContext())
    expect(res.status).toBe(400)
  })

  it('400 si falta la clave color en el body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
  })

  it('200 y persiste el color elegido de la paleta', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const chain = makeUpdateChain(null, 1)
    mockFrom.mockReturnValue(chain)

    const res = await PATCH(makeRequest({ color: '#FF0000' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ color: '#FF0000' }, { count: 'exact' })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment_color_changed', entity_id: VALID_UUID }),
    )
  })

  it('200 y limpia el color (color: null → "Sin color")', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const chain = makeUpdateChain(null, 1)
    mockFrom.mockReturnValue(chain)

    const res = await PATCH(makeRequest({ color: null }), makeContext())
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith({ color: null }, { count: 'exact' })
  })

  it('404 si el turno no existe (count === 0)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Turno no encontrado')
  })

  it('500 si hay error de DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain({ message: 'DB error', code: 'PGRST001' }, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(500)
  })
})

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

// Helper: JWT válido para tests
function makeJwt(claims: Record<string, unknown> = { tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown = { start_at: '2026-06-01T10:00:00Z', end_at: '2026-06-01T11:00:00Z' }) {
  return new Request(`http://localhost/api/appointments/${VALID_UUID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id = VALID_UUID) {
  return { params: Promise.resolve({ id }) }
}

// Mock de cadena .update().eq() con count
function makeUpdateChain(error: null | object = null, count: number = 1) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error, count }),
    }),
  }
}

describe('PATCH /api/appointments/[id]', () => {
  const validToken = makeJwt({ tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: validToken } },
    })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('400 si body es JSON inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const req = new Request(`http://localhost/api/appointments/${VALID_UUID}`, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('404 si el turno no existe (count === 0)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Turno no encontrado')
  })

  it('200 si el turno existe y se actualiza correctamente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('409 si hay conflicto de slot (error 23505)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain({ code: '23505' }, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('slot_conflict')
  })

  it('400 si start_at >= end_at', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(
      makeRequest({ start_at: '2026-06-01T11:00:00Z', end_at: '2026-06-01T10:00:00Z' }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })
})

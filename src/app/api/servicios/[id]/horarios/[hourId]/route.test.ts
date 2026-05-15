import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted ─────────────────────────────────────────────────────────────────

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
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))

import { DELETE } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

function makeDeleteParams(id: string, hourId: string) {
  return { params: Promise.resolve({ id, hourId }) }
}

function makeDeleteChain(result: { error: unknown }) {
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

// ── Tests DELETE ──────────────────────────────────────────────────────────────

describe('DELETE /api/servicios/[id]/horarios/[hourId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await DELETE(new Request('http://localhost'), makeDeleteParams('svc-1', 'hour-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await DELETE(new Request('http://localhost'), makeDeleteParams('svc-1', 'hour-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 204 cuando el horario existe y pertenece al tenant', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: null }))

    const res = await DELETE(new Request('http://localhost'), makeDeleteParams('svc-1', 'hour-uuid-1'))
    expect(res.status).toBe(204)
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: { message: 'DB error' } }))

    const res = await DELETE(new Request('http://localhost'), makeDeleteParams('svc-1', 'hour-uuid-1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al eliminar el horario')
  })
})

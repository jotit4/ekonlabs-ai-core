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

function makeParams(id: string, blockId: string) {
  return { params: Promise.resolve({ id, blockId }) }
}

function makeDeleteChain(result: { error: unknown; count: number }) {
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  }
}

// ── Tests DELETE ──────────────────────────────────────────────────────────────

describe('DELETE /api/profesionales/[id]/bloqueos/[blockId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 204 al eliminar exitosamente', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: null, count: 1 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'block-uuid-1'))
    expect(res.status).toBe(204)
  })

  it('retorna 404 si bloqueo no existe (count === 0)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: null, count: 0 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'nonexistent'))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Bloqueo no encontrado')
  })
})

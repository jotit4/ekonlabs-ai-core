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

function makeParams(id: string, scheduleId: string) {
  return { params: Promise.resolve({ id, scheduleId }) }
}

function makeDeleteChain(result: { error: unknown; count: number }) {
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  }
}

function setupDoctorAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'doctor',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

// Cadena dashboard_users.select().eq().single() usada por authorizeProfessionalAccess
function makeDashboardUserChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

// ── Tests DELETE ──────────────────────────────────────────────────────────────

describe('DELETE /api/profesionales/[id]/horarios/[scheduleId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no es admin/receptionist/doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'x-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'patient', tenant_id: 'tenant-1' })

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 204 para doctor sobre su propio professional_id', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-1' }, error: null }))
    mockFrom.mockReturnValueOnce(makeDeleteChain({ error: null, count: 1 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-uuid-1'))
    expect(res.status).toBe(204)
  })

  it('retorna 403 para doctor sobre el professional_id de OTRO profesional', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: 'prof-OTHER' }, error: null }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-uuid-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 403 para doctor sin professional_id asignado', async () => {
    setupDoctorAuth()
    mockFrom.mockReturnValueOnce(makeDashboardUserChain({ data: { professional_id: null }, error: null }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-uuid-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 204 para receptionist al eliminar exitosamente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'header.payload.sig' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
    mockFrom.mockReturnValue(makeDeleteChain({ error: null, count: 1 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-uuid-1'))
    expect(res.status).toBe(204)
  })

  it('retorna 204 al eliminar exitosamente', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: null, count: 1 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'sched-uuid-1'))
    expect(res.status).toBe(204)
  })

  it('retorna 404 si schedule no existe (count === 0)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeDeleteChain({ error: null, count: 0 }))

    const res = await DELETE(new Request('http://localhost'), makeParams('prof-1', 'nonexistent'))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Horario no encontrado')
  })
})

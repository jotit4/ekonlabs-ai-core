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

import { PATCH } from './route'

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

function setupReceptionistAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'header.payload.sig' } },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'receptionist',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/profesionales/prof-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Cadena UPDATE con .select().single()
function makeUpdateChain(result: { data: unknown; error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const SAMPLE_PROFESSIONAL = {
  professional_id: 'prof-uuid-1',
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  name: 'Dr. López Actualizado',
  email: 'lopez@clinica.com',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
}

// ── Tests PATCH ───────────────────────────────────────────────────────────────

describe('PATCH /api/profesionales/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(makePatchRequest({ name: 'Test' }), makeParams('prof-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await PATCH(makePatchRequest({ name: 'Test' }), makeParams('prof-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si body inválido', async () => {
    setupAdminAuth()
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: 'invalid json' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(400)
  })

  it('retorna 200 al actualizar profesional como admin', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateChain({ data: SAMPLE_PROFESSIONAL, error: null }))

    const res = await PATCH(makePatchRequest({ name: 'Dr. López Actualizado' }), makeParams('prof-uuid-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_PROFESSIONAL }
    expect(body.data.professional_id).toBe('prof-uuid-1')
  })

  it('retorna 200 al actualizar profesional como receptionist', async () => {
    setupReceptionistAuth()
    mockFrom.mockReturnValue(makeUpdateChain({ data: SAMPLE_PROFESSIONAL, error: null }))

    const res = await PATCH(makePatchRequest({ name: 'Dr. López Actualizado' }), makeParams('prof-uuid-1'))
    expect(res.status).toBe(200)
  })

  it('retorna 404 si profesional no existe (PGRST116)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateChain({
      data: null,
      error: { code: 'PGRST116', message: 'row not found' },
    }))

    const res = await PATCH(makePatchRequest({ name: 'Test' }), makeParams('nonexistent'))
    expect(res.status).toBe(404)
  })
})

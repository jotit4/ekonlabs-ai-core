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

import { PUT } from './route'

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

function makePutRequest(body: unknown): Request {
  return new Request('http://localhost/api/profesionales/prof-1/servicios', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SERVICE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

// ── Tests PUT ─────────────────────────────────────────────────────────────────

describe('PUT /api/profesionales/[id]/servicios', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PUT(makePutRequest({ service_ids: [] }), makeParams('prof-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await PUT(makePutRequest({ service_ids: [] }), makeParams('prof-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si body inválido (service_ids con UUID inválido)', async () => {
    setupAdminAuth()
    const res = await PUT(makePutRequest({ service_ids: ['not-a-uuid'] }), makeParams('prof-1'))
    expect(res.status).toBe(400)
  })

  it('retorna 200 al actualizar servicios con lista vacía como admin', async () => {
    setupAdminAuth()
    // DELETE chain
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await PUT(makePutRequest({ service_ids: [] }), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { service_ids: string[] } }
    expect(body.data.service_ids).toHaveLength(0)
  })

  it('retorna 200 al actualizar servicios como receptionist', async () => {
    setupReceptionistAuth()
    // DELETE chain para lista vacía
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await PUT(makePutRequest({ service_ids: [] }), makeParams('prof-1'))
    expect(res.status).toBe(200)
  })

  it('retorna 200 al asignar servicios válidos como admin', async () => {
    setupAdminAuth()
    // Primera llamada: DELETE
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Segunda llamada: INSERT
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await PUT(makePutRequest({ service_ids: [SERVICE_UUID] }), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { professional_id: string; service_ids: string[] } }
    expect(body.data.service_ids).toContain(SERVICE_UUID)
  })
})

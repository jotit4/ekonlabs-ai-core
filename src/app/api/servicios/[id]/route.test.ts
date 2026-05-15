import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

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

import { PATCH } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

// PATCH — .update().eq().select().single()
function makeUpdateEqSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid-1' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIiwidGVuYW50X2lkIjoiNTI5OGZjYzUtMTViZi00OTRjLTk2NTUtYjQ5ZDc1OWNmZWY0In0.sig',
      },
    },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

const SERVICE_ID = 'svc-uuid-1'

const UPDATED_SERVICE = {
  service_id: SERVICE_ID,
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  name: 'Kinesiología Actualizado',
  calendar_id: 'kin@cal.com',
  professional_name: 'Dr. Updated',
  duration_minutes: 45,
  active: true,
  booking_mode: 'gated',
  capacity_per_slot: null,
  requires_prescription: false,
  is_referral_only: false,
  reminder_hours_before: null,
  reminder_instructions: null,
  prerequisite_note: null,
  created_at: '2026-05-01T00:00:00Z',
}

function makePatchRequest(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  const request = new Request(`http://localhost/api/servicios/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const context = { params: Promise.resolve({ id }) }
  return [request, context]
}

// ── Tests PATCH ───────────────────────────────────────────────────────────────

describe('PATCH /api/servicios/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const [req, ctx] = makePatchRequest(SERVICE_ID, { name: 'Nuevo nombre' })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const [req, ctx] = makePatchRequest(SERVICE_ID, { name: 'Nuevo nombre' })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 400 si body inválido (name vacío string)', async () => {
    setupAdminAuth()

    // name: '' viola min(1) en UpdateServiceSchema
    const [req, ctx] = makePatchRequest(SERVICE_ID, { name: '' })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 200 con servicio actualizado cuando datos válidos', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateEqSelectSingleChain({ data: UPDATED_SERVICE, error: null }))

    const [req, ctx] = makePatchRequest(SERVICE_ID, { name: 'Kinesiología Actualizado', duration_minutes: 45 })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof UPDATED_SERVICE }
    expect(body.data.name).toBe('Kinesiología Actualizado')
    expect(body.data.duration_minutes).toBe(45)
  })

  it('retorna 200 con active: false para desactivación lógica', async () => {
    setupAdminAuth()
    const deactivatedService = { ...UPDATED_SERVICE, name: 'Kinesiología', active: false }
    mockFrom.mockReturnValue(makeUpdateEqSelectSingleChain({ data: deactivatedService, error: null }))

    const [req, ctx] = makePatchRequest(SERVICE_ID, { active: false })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof deactivatedService }
    expect(body.data.active).toBe(false)
  })

  it('retorna 404 si Supabase devuelve PGRST116 (id no existe en tenant)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateEqSelectSingleChain({ data: null, error: { code: 'PGRST116' } }))

    const [req, ctx] = makePatchRequest('non-existent-id', { name: 'Otro nombre' })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Servicio no encontrado')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateEqSelectSingleChain({ data: null, error: { message: 'DB error' } }))

    const [req, ctx] = makePatchRequest(SERVICE_ID, { name: 'Nombre válido' })
    const res = await PATCH(req, ctx)
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al actualizar el servicio')
  })
})

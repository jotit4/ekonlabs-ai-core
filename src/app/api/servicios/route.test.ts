import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
}))

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

// Mock createSupabaseServerClient
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

import { GET, POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

// GET — .select().order()
function makeSelectOrderChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

// POST — .insert().select().single()
function makeInsertSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
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

const SAMPLE_SERVICE = {
  service_id: 'svc-uuid-1',
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  name: 'Kinesiología',
  calendar_id: 'kin@group.calendar.google.com',
  professional_name: 'Patricia Pérez',
  duration_minutes: 60,
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

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/servicios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doctor-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 200 con { data: Service[] } cuando admin con sesión válida', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: [SAMPLE_SERVICE], error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_SERVICE[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Kinesiología')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener servicios')
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/servicios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makePostRequest(body: unknown): Request {
    return new Request('http://localhost/api/servicios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(makePostRequest({ name: 'Kinesiología', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si rol no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await POST(makePostRequest({ name: 'Kinesiología', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 400 si body inválido (name vacío)', async () => {
    setupAdminAuth()

    const res = await POST(makePostRequest({ name: '', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 201 con servicio creado cuando datos válidos', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_SERVICE, error: null }))

    const res = await POST(makePostRequest({ name: 'Kinesiología', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_SERVICE }
    expect(body.data.name).toBe('Kinesiología')
  })

  it('retorna 409 cuando viola UNIQUE constraint (code: 23505)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(
      makeInsertSelectSingleChain({ data: null, error: { code: '23505', message: 'unique violation' } })
    )

    const res = await POST(makePostRequest({ name: 'Kinesiología', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Ya existe un servicio con ese nombre')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(
      makeInsertSelectSingleChain({ data: null, error: { code: '99999', message: 'DB error' } })
    )

    const res = await POST(makePostRequest({ name: 'Kinesiología', calendar_id: 'kin@cal.com' }))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al crear el servicio')
  })
})

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

import { GET, POST } from './route'

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

function makeGetParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/servicios/svc-1/horarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSelectChain(result: { data: unknown; error: unknown }) {
  // La cadena tiene dos .order() — el primero retorna un objeto con otro .order() que resuelve
  const secondOrder = vi.fn().mockResolvedValue(result)
  const firstOrder = vi.fn().mockReturnValue({ order: secondOrder })
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: firstOrder,
  }
}

function makeInsertSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const SAMPLE_HOUR = {
  hour_id: 'hour-uuid-1',
  service_id: 'svc-1',
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '18:00:00',
  slot_duration_minutes: 30,
  active: true,
  created_at: '2026-05-13T00:00:00Z',
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/servicios/[id]/horarios', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeGetParams('svc-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET(new Request('http://localhost'), makeGetParams('svc-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 200 con { data: ServiceHour[] } cuando admin válido', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_HOUR], error: null }))

    const res = await GET(new Request('http://localhost'), makeGetParams('svc-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_HOUR[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].hour_id).toBe('hour-uuid-1')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET(new Request('http://localhost'), makeGetParams('svc-1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener horarios')
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/servicios/[id]/horarios', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePostRequest({ day_of_week: 1, start_time: '09:00', end_time: '18:00' }), makeGetParams('svc-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await POST(makePostRequest({ day_of_week: 1, start_time: '09:00', end_time: '18:00' }), makeGetParams('svc-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 400 si body inválido (end_time <= start_time)', async () => {
    setupAdminAuth()

    const res = await POST(
      makePostRequest({ day_of_week: 1, start_time: '18:00', end_time: '09:00' }),
      makeGetParams('svc-1')
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 201 con hora creada cuando datos válidos', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: SAMPLE_HOUR, error: null }))

    const res = await POST(
      makePostRequest({ day_of_week: 1, start_time: '09:00', end_time: '18:00', slot_duration_minutes: 30 }),
      makeGetParams('svc-1')
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_HOUR }
    expect(body.data.hour_id).toBe('hour-uuid-1')
  })

  it('normaliza "HH:mm" a "HH:mm:00" en el INSERT', async () => {
    setupAdminAuth()
    const insertSpy = vi.fn().mockReturnThis()
    const selectSpy = vi.fn().mockReturnThis()
    const singleSpy = vi.fn().mockResolvedValue({ data: SAMPLE_HOUR, error: null })
    mockFrom.mockReturnValue({
      insert: insertSpy,
      select: selectSpy,
      single: singleSpy,
    })

    await POST(
      makePostRequest({ day_of_week: 2, start_time: '10:30', end_time: '17:45' }),
      makeGetParams('svc-1')
    )

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: '10:30:00',
        end_time: '17:45:00',
      })
    )
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeInsertSelectSingleChain({ data: null, error: { message: 'DB error' } }))

    const res = await POST(
      makePostRequest({ day_of_week: 1, start_time: '09:00', end_time: '18:00' }),
      makeGetParams('svc-1')
    )
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al crear el horario')
  })
})

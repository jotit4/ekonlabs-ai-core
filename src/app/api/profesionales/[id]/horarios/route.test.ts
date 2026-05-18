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

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/profesionales/prof-1/horarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Cadena para SELECT con dos .order()
function makeSelectChain(result: { data: unknown; error: unknown }) {
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

const SAMPLE_SCHEDULE = {
  schedule_id: 'sched-uuid-1',
  professional_id: 'prof-1',
  day_of_week: 0,
  start_time: '09:00:00',
  end_time: '18:00:00',
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/profesionales/[id]/horarios', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 200 con { data: ProfessionalSchedule[] } para admin válido', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_SCHEDULE], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_SCHEDULE[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].schedule_id).toBe('sched-uuid-1')
  })

  it('retorna 200 con horarios para receptionist', async () => {
    setupReceptionistAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: [SAMPLE_SCHEDULE], error: null }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_SCHEDULE[] }
    expect(body.data).toHaveLength(1)
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET(new Request('http://localhost'), makeParams('prof-1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener horarios del profesional')
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/profesionales/[id]/horarios', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna 401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePostRequest({ day_of_week: 0, start_time: '09:00', end_time: '18:00' }), makeParams('prof-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await POST(makePostRequest({ day_of_week: 0, start_time: '09:00', end_time: '18:00' }), makeParams('prof-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 400 si body inválido (end_time <= start_time)', async () => {
    setupAdminAuth()

    const res = await POST(
      makePostRequest({ day_of_week: 0, start_time: '18:00', end_time: '09:00' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 409 si hay solapamiento con horario existente', async () => {
    setupAdminAuth()

    // Simular la secuencia de promesas: primero el select, luego el insert
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ start_time: '08:00:00', end_time: '13:00:00' }],
          error: null,
        }),
      }),
    })

    const res = await POST(
      makePostRequest({ day_of_week: 0, start_time: '09:00', end_time: '12:00' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Este horario se solapa con uno existente')
  })

  it('retorna 201 con schedule creado para datos válidos', async () => {
    setupAdminAuth()

    // Primera llamada: select de horarios existentes (vacío)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })
    // Segunda llamada: insert
    mockFrom.mockReturnValueOnce(makeInsertSelectSingleChain({ data: SAMPLE_SCHEDULE, error: null }))

    const res = await POST(
      makePostRequest({ day_of_week: 0, start_time: '09:00', end_time: '18:00' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { data: typeof SAMPLE_SCHEDULE }
    expect(body.data.schedule_id).toBe('sched-uuid-1')
  })

  it('normaliza "HH:mm" a "HH:mm:00" en el INSERT', async () => {
    setupAdminAuth()

    // Primera llamada: select de horarios existentes (vacío)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })

    const insertSpy = vi.fn().mockReturnThis()
    const selectSpy = vi.fn().mockReturnThis()
    const singleSpy = vi.fn().mockResolvedValue({ data: SAMPLE_SCHEDULE, error: null })
    // Segunda llamada: insert
    mockFrom.mockReturnValueOnce({
      insert: insertSpy,
      select: selectSpy,
      single: singleSpy,
    })

    await POST(
      makePostRequest({ day_of_week: 2, start_time: '10:30', end_time: '17:45' }),
      makeParams('prof-1')
    )

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: '10:30:00',
        end_time: '17:45:00',
      })
    )
  })

  it('retorna 201 para receptionist con datos válidos', async () => {
    setupReceptionistAuth()

    // Primera llamada: select de horarios existentes (vacío)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })
    // Segunda llamada: insert
    mockFrom.mockReturnValueOnce(makeInsertSelectSingleChain({ data: SAMPLE_SCHEDULE, error: null }))

    const res = await POST(
      makePostRequest({ day_of_week: 0, start_time: '09:00', end_time: '18:00' }),
      makeParams('prof-1')
    )
    expect(res.status).toBe(201)
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockLogAudit: vi.fn().mockResolvedValue(undefined),
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
    }),
  ),
}))
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

import { GET, POST } from './route'

function makeJwt(claims: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const TENANT_ID = '5298fcc5-15bf-494c-9655-b49d759cfef4'

function makeGetRequest(query: string) {
  return new Request(`http://localhost/api/agenda/day-status?${query}`, { method: 'GET' })
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/agenda/day-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Query builders que soportan el chaining real usado en la route ─────────────
function makeSelectChain(data: unknown[] | null, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => Promise.resolve({ data, error }))
  return chain
}

function makeUpsertChain(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error })
  const select = vi.fn(() => ({ single }))
  const upsert = vi.fn(() => ({ select }))
  return { upsert, select, single }
}

describe('GET /api/agenda/day-status', () => {
  const validToken = makeJwt({ tenant_id: TENANT_ID, app_role: 'receptionist' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: validToken } } })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(401)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ app_role: 'admin' }) } },
    })
    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(400)
  })

  it('403 si el rol no es admin/receptionist/doctor', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'otro' }) } },
    })
    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(403)
  })

  it('permite rol doctor (lectura abierta a los 3 roles)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'doctor' }) } },
    })
    mockFrom.mockImplementation((table: string) =>
      table === 'holidays' ? makeSelectChain([]) : makeSelectChain([]),
    )
    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(200)
  })

  it('400 si falta date_from o date_to', async () => {
    const res = await GET(makeGetRequest('date_from=2026-12-01'))
    expect(res.status).toBe(400)
  })

  it('400 si el formato de fecha es inválido', async () => {
    const res = await GET(makeGetRequest('date_from=01-12-2026&date_to=2026-12-31'))
    expect(res.status).toBe(400)
  })

  it('400 si date_to es anterior a date_from', async () => {
    const res = await GET(makeGetRequest('date_from=2026-12-31&date_to=2026-12-01'))
    expect(res.status).toBe(400)
  })

  it('400 si el rango supera el máximo permitido', async () => {
    const res = await GET(makeGetRequest('date_from=2026-01-01&date_to=2026-12-31'))
    expect(res.status).toBe(400)
  })

  it('200 y arma el merge feriado + decisión → effectiveOpen correcto', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'holidays') {
        return makeSelectChain([
          { holiday_id: 'h-1', country: 'AR', holiday_date: '2026-12-08', name: 'Inmaculada Concepción de María' },
          { holiday_id: 'h-2', country: 'AR', holiday_date: '2026-12-25', name: 'Navidad' },
        ])
      }
      // clinic_day_status: el 25/12 tiene una decisión explícita "abre"
      return makeSelectChain([
        {
          day_status_id: 'ds-1',
          tenant_id: TENANT_ID,
          status_date: '2026-12-25',
          is_open: true,
          reason: null,
          decided_by: 'user-1',
          decided_by_name: 'Ana Recepción',
          decided_at: '2026-12-01T00:00:00.000Z',
        },
      ])
    })

    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(200)
    const body = await res.json()

    // 08/12: feriado sin decisión → cerrado por defecto
    expect(body.days['2026-12-08']).toMatchObject({
      isHoliday: true,
      holidayName: 'Inmaculada Concepción de María',
      decisionIsOpen: null,
      effectiveOpen: false,
    })

    // 25/12: feriado CON decisión "abre" → abierto
    expect(body.days['2026-12-25']).toMatchObject({
      isHoliday: true,
      holidayName: 'Navidad',
      decisionIsOpen: true,
      decidedByName: 'Ana Recepción',
      effectiveOpen: true,
    })
  })

  it('200 y agrega un día NORMAL cerrado a mano (sin ser feriado)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'holidays') return makeSelectChain([])
      return makeSelectChain([
        {
          day_status_id: 'ds-2',
          tenant_id: TENANT_ID,
          status_date: '2026-12-15',
          is_open: false,
          reason: 'Corte de agua',
          decided_by: 'user-1',
          decided_by_name: 'Ana Recepción',
          decided_at: '2026-12-10T00:00:00.000Z',
        },
      ])
    })

    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    const body = await res.json()
    expect(body.days['2026-12-15']).toMatchObject({
      isHoliday: false,
      holidayName: null,
      decisionIsOpen: false,
      reason: 'Corte de agua',
      effectiveOpen: false,
    })
  })

  it('500 si hay error de DB', async () => {
    mockFrom.mockImplementation(() => makeSelectChain(null, { message: 'DB error' }))
    const res = await GET(makeGetRequest('date_from=2026-12-01&date_to=2026-12-31'))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/agenda/day-status', () => {
  const validToken = makeJwt({ tenant_id: TENANT_ID, app_role: 'receptionist', full_name: 'Ana Recepción' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: validToken } } })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makePostRequest({ date: '2026-12-25', is_open: true }))
    expect(res.status).toBe(401)
  })

  it('403 si el rol es doctor (no decide el estado del día)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'doctor' }) } },
    })
    const res = await POST(makePostRequest({ date: '2026-12-25', is_open: true }))
    expect(res.status).toBe(403)
  })

  it('permite rol admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'admin' }) } },
    })
    mockFrom.mockReturnValue(
      makeUpsertChain({
        day_status_id: 'ds-1',
        tenant_id: TENANT_ID,
        status_date: '2026-12-25',
        is_open: true,
        reason: null,
        decided_by: 'user-1',
        decided_by_name: null,
        decided_at: '2026-12-01T00:00:00.000Z',
      }),
    )
    const res = await POST(makePostRequest({ date: '2026-12-25', is_open: true }))
    expect(res.status).toBe(200)
  })

  it('400 si el body es JSON inválido', async () => {
    const req = new Request('http://localhost/api/agenda/day-status', { method: 'POST', body: 'not-json' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 si falta is_open', async () => {
    const res = await POST(makePostRequest({ date: '2026-12-25' }))
    expect(res.status).toBe(400)
  })

  it('400 si la fecha no cumple YYYY-MM-DD', async () => {
    const res = await POST(makePostRequest({ date: '25-12-2026', is_open: true }))
    expect(res.status).toBe(400)
  })

  it('200 — upsert con tenant_id explícito, decided_by/decided_by_name/decided_at, y llama logAudit', async () => {
    const chain = makeUpsertChain({
      day_status_id: 'ds-1',
      tenant_id: TENANT_ID,
      status_date: '2026-12-25',
      is_open: false,
      reason: 'No abrimos este año',
      decided_by: 'user-1',
      decided_by_name: 'Ana Recepción',
      decided_at: '2026-12-01T00:00:00.000Z',
    })
    mockFrom.mockReturnValue(chain)

    const res = await POST(makePostRequest({ date: '2026-12-25', is_open: false, reason: 'No abrimos este año' }))
    expect(res.status).toBe(200)

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        status_date: '2026-12-25',
        is_open: false,
        reason: 'No abrimos este año',
        decided_by: 'user-1',
        decided_by_name: 'Ana Recepción',
      }),
      { onConflict: 'tenant_id,status_date' },
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'clinic_day_status_updated',
        entity_type: 'clinic_day_status',
        entity_id: '2026-12-25',
      }),
    )
  })

  it('500 si hay error de DB en el upsert', async () => {
    mockFrom.mockReturnValue(makeUpsertChain(null, { message: 'DB error' }))
    const res = await POST(makePostRequest({ date: '2026-12-25', is_open: true }))
    expect(res.status).toBe(500)
  })
})

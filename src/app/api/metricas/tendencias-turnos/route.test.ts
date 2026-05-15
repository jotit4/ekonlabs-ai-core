import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks hoisted (antes del hoisting de vi.mock) ──────────────────────────────
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

import { GET } from './route'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/metricas/tendencias-turnos')
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new Request(url.toString())
}

function setupAdminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'token.admin.test' } },
  })
  mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
}

function makeAppointmentsChain(data: Array<{ start_at: string; status: string }>) {
  return {
    select: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          range: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }),
    }),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/metricas/tendencias-turnos', () => {
  const DEFAULT_PARAMS = {
    desde: '2026-05-01T00:00:00-03:00',
    hasta: '2026-05-31T23:59:59-03:00',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockParseJwt.mockReturnValue(null)

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    expect(res.status).toBe(401)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el usuario no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'medico' })

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    expect(res.status).toBe(403)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo administradores pueden ver métricas')
  })

  // ── Parámetros ─────────────────────────────────────────────────────────────

  it('retorna 400 si faltan ambos parámetros desde y hasta', async () => {
    setupAdminUser()

    const res = await GET(makeRequest())
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Parámetros desde y hasta son requeridos')
  })

  it('retorna 400 si falta solo desde', async () => {
    setupAdminUser()

    const res = await GET(makeRequest({ hasta: DEFAULT_PARAMS.hasta }))
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Parámetros desde y hasta son requeridos')
  })

  it('retorna 400 si falta solo hasta', async () => {
    setupAdminUser()

    const res = await GET(makeRequest({ desde: DEFAULT_PARAMS.desde }))
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Parámetros desde y hasta son requeridos')
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('retorna 200 con array vacío si no hay turnos en el período', async () => {
    setupAdminUser()
    mockFrom.mockReturnValue(makeAppointmentsChain([]))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    expect(res.status).toBe(200)

    const body = await res.json() as { data: { semanas: unknown[] } }
    expect(body.data.semanas).toHaveLength(0)
  })

  it('retorna 200 con semanas agrupadas correctamente cuando hay turnos', async () => {
    setupAdminUser()

    const appointments = [
      { start_at: '2026-05-11T10:00:00-03:00', status: 'confirmed' },
      { start_at: '2026-05-12T11:00:00-03:00', status: 'cancelled' },
      { start_at: '2026-05-18T09:00:00-03:00', status: 'no_show' },
    ]
    mockFrom.mockReturnValue(makeAppointmentsChain(appointments))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    expect(res.status).toBe(200)

    const body = await res.json() as { data: { semanas: Array<{ semana_inicio: string; total: number }> } }
    // Dos semanas distintas
    expect(body.data.semanas).toHaveLength(2)
    // Semana del 11/05 tiene 2 turnos (confirmed + cancelled)
    const sem1 = body.data.semanas.find(s => s.semana_inicio === '2026-05-11')
    expect(sem1?.total).toBe(2)
    // Semana del 18/05 tiene 1 turno (no_show)
    const sem2 = body.data.semanas.find(s => s.semana_inicio === '2026-05-18')
    expect(sem2?.total).toBe(1)
  })

  it('agrupa confirmed y completed en el campo confirmados', async () => {
    setupAdminUser()

    const appointments = [
      { start_at: '2026-05-11T10:00:00-03:00', status: 'confirmed' },
      { start_at: '2026-05-12T11:00:00-03:00', status: 'completed' },
    ]
    mockFrom.mockReturnValue(makeAppointmentsChain(appointments))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    const body = await res.json() as { data: { semanas: Array<{ confirmados: number; cancelados: number; no_shows: number; total: number }> } }

    expect(body.data.semanas).toHaveLength(1)
    expect(body.data.semanas[0].confirmados).toBe(2)
    expect(body.data.semanas[0].cancelados).toBe(0)
    expect(body.data.semanas[0].no_shows).toBe(0)
    expect(body.data.semanas[0].total).toBe(2)
  })

  it('agrupa cancelled en cancelados', async () => {
    setupAdminUser()

    const appointments = [
      { start_at: '2026-05-11T10:00:00-03:00', status: 'cancelled' },
      { start_at: '2026-05-12T11:00:00-03:00', status: 'cancelled' },
    ]
    mockFrom.mockReturnValue(makeAppointmentsChain(appointments))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    const body = await res.json() as { data: { semanas: Array<{ confirmados: number; cancelados: number; no_shows: number }> } }

    expect(body.data.semanas[0].cancelados).toBe(2)
    expect(body.data.semanas[0].confirmados).toBe(0)
    expect(body.data.semanas[0].no_shows).toBe(0)
  })

  it('agrupa no_show en no_shows', async () => {
    setupAdminUser()

    const appointments = [
      { start_at: '2026-05-18T09:00:00-03:00', status: 'no_show' },
      { start_at: '2026-05-19T10:00:00-03:00', status: 'no_show' },
    ]
    mockFrom.mockReturnValue(makeAppointmentsChain(appointments))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    const body = await res.json() as { data: { semanas: Array<{ no_shows: number; confirmados: number; cancelados: number }> } }

    expect(body.data.semanas[0].no_shows).toBe(2)
    expect(body.data.semanas[0].confirmados).toBe(0)
    expect(body.data.semanas[0].cancelados).toBe(0)
  })

  it('ordena semanas cronológicamente por semana_inicio', async () => {
    setupAdminUser()

    // Turnos en semanas no consecutivas — verificar orden
    const appointments = [
      { start_at: '2026-05-25T10:00:00-03:00', status: 'confirmed' }, // Sem 22
      { start_at: '2026-05-04T10:00:00-03:00', status: 'confirmed' }, // Sem 19
      { start_at: '2026-05-11T10:00:00-03:00', status: 'confirmed' }, // Sem 20
    ]
    mockFrom.mockReturnValue(makeAppointmentsChain(appointments))

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    const body = await res.json() as { data: { semanas: Array<{ semana_inicio: string }> } }

    const semanas = body.data.semanas
    expect(semanas).toHaveLength(3)
    expect(semanas[0].semana_inicio < semanas[1].semana_inicio).toBe(true)
    expect(semanas[1].semana_inicio < semanas[2].semana_inicio).toBe(true)
  })

  // ── Validación de fechas ───────────────────────────────────────────────────

  it('retorna 400 si desde es una fecha inválida', async () => {
    setupAdminUser()
    const res = await GET(makeRequest({ desde: 'not-a-date', hasta: DEFAULT_PARAMS.hasta }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('ISO 8601')
  })

  it('retorna 400 si desde > hasta (rango invertido)', async () => {
    setupAdminUser()
    const res = await GET(makeRequest({
      desde: '2026-05-31T23:59:59-03:00',
      hasta: '2026-05-01T00:00:00-03:00'
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('El rango de fechas es inválido')
  })

  // ── Error DB ───────────────────────────────────────────────────────────────

  it('retorna 500 si Supabase lanza error en la query de appointments', async () => {
    setupAdminUser()

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            range: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('DB error'),
              }),
            }),
          }),
        }),
      }),
    })

    const res = await GET(makeRequest(DEFAULT_PARAMS))
    expect(res.status).toBe(500)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener turnos')
  })
})

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

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Chain para SELECT con count: .select().gte().lte()
 */
function makeSelectCountChain(count: number | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockResolvedValue({ count, error }),
      }),
    }),
  }
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid-1' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIn0.sig' } },
  })
  mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
}

/**
 * Configura chains de mockFrom por tabla para las 4 queries de KPIs con Promise.all.
 * Con Promise.all el orden de llamadas no está garantizado, por eso se discrimina
 * por nombre de tabla y shape de chain (eq vs in vs solo gte).
 */
function setupKPIChains(
  turnosMes = 20,
  noShows = 3,
  pacientesNuevos = 5,
  confirmedOrCompleted = 15
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'patients') return makeSelectCountChain(pacientesNuevos)
    // Para 'appointments': 3 queries con shapes distintas — eq (no_shows), in (ocupacion), solo gte (turnos_mes)
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: noShows, error: null }),
          }),
        }),
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: confirmedOrCompleted, error: null }),
          }),
        }),
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ count: turnosMes, error: null }),
        }),
      }),
    }
  })
}

function makeRequest(desde = '2026-05-01T00:00:00-03:00', hasta = '2026-05-13T12:00:00-03:00') {
  return new Request(`http://localhost/api/metricas/kpis?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/metricas/kpis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 401 si getUser retorna error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  // ── Validación de parámetros ───────────────────────────────────────────────

  it('retorna 400 si falta el parámetro desde', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/kpis?hasta=2026-05-13T12:00:00Z'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('desde')
  })

  it('retorna 400 si falta el parámetro hasta', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/kpis?desde=2026-05-01T00:00:00Z'))
    expect(res.status).toBe(400)
  })

  it('retorna 400 si las fechas no son ISO 8601 válidas', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/kpis?desde=invalid-date&hasta=also-invalid'))
    expect(res.status).toBe(400)
  })

  // ── Respuesta correcta ─────────────────────────────────────────────────────

  it('retorna 200 con { data: ClinicKPIs } cuando todo es válido', async () => {
    setupAdminAuth()
    setupKPIChains(20, 3, 5, 15)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data).toBeDefined()
    expect(body.data.turnos_mes).toBe(20)
    expect(body.data.no_shows).toBe(3)
    expect(body.data.pacientes_nuevos).toBe(5)
    expect(body.data.ocupacion_pct).toBe(75) // 15/20 * 100
    expect(body.data.ocupacion_numerador).toBe(15)
    expect(body.data.ocupacion_denominador).toBe(20)
  })

  it('calcula ocupacion_pct = 0 cuando no hay turnos en el período', async () => {
    setupAdminAuth()
    setupKPIChains(0, 0, 5, 0)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.ocupacion_pct).toBe(0)
    expect(body.data.turnos_mes).toBe(0)
  })

  it('incluye periodo_desde y periodo_hasta en la respuesta', async () => {
    setupAdminAuth()
    setupKPIChains(10, 1, 2, 8)

    const desde = '2026-05-01T00:00:00-03:00'
    const hasta = '2026-05-13T12:00:00-03:00'
    const res = await GET(makeRequest(desde, hasta))
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.periodo_desde).toBe(desde)
    expect(body.data.periodo_hasta).toBe(hasta)
  })

  // ── Errores de DB ──────────────────────────────────────────────────────────

  it('retorna 500 si falla la query de turnos_mes', async () => {
    setupAdminAuth()
    // Con Promise.all, usamos table-based mock — turnos_mes es appointments sin eq/in
    mockFrom.mockImplementation((table: string) => {
      if (table === 'patients') return makeSelectCountChain(5)
      // appointments: devuelve error en la chain de turnosMes (solo gte), éxito en eq/in
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: 3, error: null }),
            }),
          }),
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: 15, error: null }),
            }),
          }),
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
          }),
        }),
      }
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('turnos')
  })

  it('retorna 500 si falla la query de no_shows', async () => {
    setupAdminAuth()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'patients') return makeSelectCountChain(5)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
            }),
          }),
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: 15, error: null }),
            }),
          }),
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: 20, error: null }),
          }),
        }),
      }
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('no-shows')
  })

  it('retorna 500 si falla la query de pacientes_nuevos', async () => {
    setupAdminAuth()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'patients') return makeSelectCountChain(null, { message: 'DB error' })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: 3, error: null }),
            }),
          }),
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ count: 15, error: null }),
            }),
          }),
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: 20, error: null }),
          }),
        }),
      }
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('pacientes nuevos')
  })

  it('retorna 400 si desde > hasta (rango invertido)', async () => {
    setupAdminAuth()
    const res = await GET(makeRequest('2026-05-31T23:59:59-03:00', '2026-05-01T00:00:00-03:00'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('El rango de fechas es inválido')
  })
})

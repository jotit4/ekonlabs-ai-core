import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockRpc, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
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

// Mock createSupabaseServerClient — incluye rpc para get_agent_kpis
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
      },
      from: mockFrom,
      rpc: mockRpc,
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Configura la respuesta del RPC get_agent_kpis.
 * Siempre retorna 1 fila (aggregates).
 */
function makeRpcAgentKpisResult(
  total_conversaciones: number = 0,
  response_time_avg_ms: number | null = null,
  error: unknown = null
) {
  return Promise.resolve({
    data: error ? null : [{ total_conversaciones, response_time_avg_ms }],
    error: error ?? null,
  })
}

/**
 * Chain para la query unificada de audit_logs:
 * .select('entity_id', { count: 'exact' }).eq().gte().lte()
 * Devuelve data (entity_id rows) + count (escalaciones totales).
 */
function makeTakeoverChain(
  data: { entity_id: string }[] = [],
  count: number = 0,
  error: unknown = null
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data, count, error: error ?? null }),
        }),
      }),
    }),
  }
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid-1' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIn0.sig',
      },
    },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

/**
 * Configura las 2 fuentes de datos del handler refactorizado:
 *   1. mockRpc → simula get_agent_kpis(desde, hasta)
 *   2. mockFrom → simula la query unificada de audit_logs (escalaciones + takeover phones)
 */
function setupAgentKPIChains(
  totalConversaciones = 2,
  responseTimeAvgMs: number | null = null,
  takeoverLogs: { entity_id: string }[] = [{ entity_id: '+54911' }],
  escalaciones = 2
) {
  mockRpc.mockReturnValue(makeRpcAgentKpisResult(totalConversaciones, responseTimeAvgMs))
  mockFrom.mockReturnValue(makeTakeoverChain(takeoverLogs, escalaciones))
}

function makeRequest(
  desde = '2026-05-01T00:00:00-03:00',
  hasta = '2026-05-13T12:00:00-03:00'
) {
  return new Request(
    `http://localhost/api/metricas/agente-kpis?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/metricas/agente-kpis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 401 si getUser retorna error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' },
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
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

    const res = await GET(
      new Request('http://localhost/api/metricas/agente-kpis?hasta=2026-05-13T12:00:00Z')
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('desde')
  })

  it('retorna 400 si falta el parámetro hasta', async () => {
    setupAdminAuth()

    const res = await GET(
      new Request('http://localhost/api/metricas/agente-kpis?desde=2026-05-01T00:00:00Z')
    )
    expect(res.status).toBe(400)
  })

  it('retorna 400 si las fechas no son ISO 8601 válidas', async () => {
    setupAdminAuth()

    const res = await GET(
      new Request(
        'http://localhost/api/metricas/agente-kpis?desde=invalid-date&hasta=also-invalid'
      )
    )
    expect(res.status).toBe(400)
  })

  it('retorna 400 si desde > hasta (rango invertido)', async () => {
    setupAdminAuth()
    const res = await GET(makeRequest('2026-05-31T23:59:59-03:00', '2026-05-01T00:00:00-03:00'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('El rango de fechas es inválido')
  })

  // ── Respuesta correcta ─────────────────────────────────────────────────────

  it('retorna 200 con { data: AgentKPIs } cuando todo es válido', async () => {
    setupAdminAuth()
    setupAgentKPIChains(
      2,     // total_conversaciones
      null,  // response_time_avg_ms
      [{ entity_id: '+54911' }],
      2      // escalaciones count
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toBeDefined()
    expect(body.data.escalaciones).toBe(2)
    expect(body.data.total_conversaciones).toBe(2)
    expect(body.data.fallback_rate).toBeNull()
  })

  it('calcula containment_rate correctamente (50% cuando 1 de 2 tuvo takeover)', async () => {
    setupAdminAuth()
    setupAgentKPIChains(
      2,     // total_conversaciones
      null,
      [{ entity_id: '+54911' }],
      1
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.containment_rate).toBe(50) // (2-1)/2 * 100 = 50
  })

  it('containment_rate es null cuando no hay conversaciones', async () => {
    setupAdminAuth()
    setupAgentKPIChains(0, null, [], 0)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.containment_rate).toBeNull()
    expect(body.data.total_conversaciones).toBe(0)
  })

  it('fallback_rate siempre es null (sin datos FastAPI)', async () => {
    setupAdminAuth()
    setupAgentKPIChains()

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.fallback_rate).toBeNull()
  })

  it('response_time_avg_ms es null cuando la RPC no tiene pares user→assistant válidos', async () => {
    setupAdminAuth()
    setupAgentKPIChains(0, null, [], 0)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.response_time_avg_ms).toBeNull()
  })

  it('response_time_avg_ms pasa el valor de la RPC redondeado a ms enteros', async () => {
    setupAdminAuth()
    setupAgentKPIChains(
      1,
      2000,  // RPC devuelve 2000ms (pares user→assistant a 2s de diferencia)
      [],
      0
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.response_time_avg_ms).toBe(2000)
  })

  it('response_time_avg_ms se redondea a entero cuando la RPC devuelve decimal', async () => {
    setupAdminAuth()
    setupAgentKPIChains(1, 1234.7, [], 0)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.response_time_avg_ms).toBe(1235)
  })

  it('incluye periodo_desde y periodo_hasta en la respuesta', async () => {
    setupAdminAuth()
    setupAgentKPIChains()

    const desde = '2026-05-01T00:00:00-03:00'
    const hasta = '2026-05-13T12:00:00-03:00'
    const res = await GET(makeRequest(desde, hasta))
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.periodo_desde).toBe(desde)
    expect(body.data.periodo_hasta).toBe(hasta)
  })

  it('containment_rate es 100% cuando no hay takeovers con conversaciones', async () => {
    setupAdminAuth()
    setupAgentKPIChains(
      2, // 2 conversaciones
      null,
      [],  // 0 takeovers
      0
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.containment_rate).toBe(100)
  })

  // ── Errores de DB ──────────────────────────────────────────────────────────

  it('retorna 500 si falla la RPC get_agent_kpis', async () => {
    setupAdminAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
    mockFrom.mockReturnValue(makeTakeoverChain([], 0))

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('KPIs del agente')
  })

  it('retorna 500 si falla la query unificada de audit_logs (escalaciones/contención)', async () => {
    setupAdminAuth()
    mockRpc.mockReturnValue(makeRpcAgentKpisResult(2, null))
    mockFrom.mockReturnValue(makeTakeoverChain([], 0, { message: 'DB error' }))

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('contención')
  })

  it('llama al RPC con los parámetros desde y hasta correctos', async () => {
    setupAdminAuth()
    setupAgentKPIChains()

    const desde = '2026-05-01T00:00:00-03:00'
    const hasta = '2026-05-13T12:00:00-03:00'
    await GET(makeRequest(desde, hasta))

    expect(mockRpc).toHaveBeenCalledWith('get_agent_kpis', { desde, hasta })
  })
})

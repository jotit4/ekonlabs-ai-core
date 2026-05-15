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
 * Chain para SELECT con count + eq + gte + lte:
 * audit_logs escalaciones / contención
 */
function makeAuditCountChain(count: number | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ count, error }),
        }),
      }),
    }),
  }
}

/**
 * Chain para SELECT de datos con eq + gte + lte + range (conversations phone_number):
 */
function makeDataChain(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    }),
  }
}

/**
 * Chain para SELECT de datos con eq + gte + lte SIN range (audit_logs entity_id — takeoverLogs):
 */
function makeAuditDataChain(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  }
}

/**
 * Chain para SELECT de mensajes con in + gte + lte + range + order + order (response time):
 */
function makeMessagesChain(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            range: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data, error }),
              }),
            }),
          }),
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
 * Configura las 4 chains para las queries de fetchAgentKPIs en orden:
 * 1. escalaciones (count) → audit_logs .select().eq().gte().lte()
 * 2. phone_numbers únicos → conversations .select().eq().gte().lte().range() → data
 * 3. takeover phones → audit_logs .select().eq().gte().lte() → data (SIN range)
 * 4. mensajes response time → conversations .select().in().gte().lte().range().order().order() → data
 */
function setupAgentKPIChains(
  escalaciones = 2,
  phoneRows: { phone_number: string }[] = [{ phone_number: '+54911' }, { phone_number: '+54912' }],
  takeoverLogs: { entity_id: string }[] = [{ entity_id: '+54911' }],
  mensajes: { phone_number: string; role: string; created_at: string }[] = []
) {
  let callCount = 0
  mockFrom.mockImplementation(() => {
    callCount++
    if (callCount === 1) return makeAuditCountChain(escalaciones)
    if (callCount === 2) return makeDataChain(phoneRows)
    if (callCount === 3) return makeAuditDataChain(takeoverLogs)
    return makeMessagesChain(mensajes)
  })
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
      2,
      [{ phone_number: '+54911' }, { phone_number: '+54912' }],
      [{ entity_id: '+54911' }],
      []
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
      1,
      [{ phone_number: '+54911' }, { phone_number: '+54912' }],
      [{ entity_id: '+54911' }],
      []
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.containment_rate).toBe(50) // (2-1)/2 * 100 = 50
  })

  it('containment_rate es null cuando no hay conversaciones', async () => {
    setupAdminAuth()
    setupAgentKPIChains(0, [], [], [])

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

  it('response_time_avg_ms es null cuando no hay pares user→assistant', async () => {
    setupAdminAuth()
    setupAgentKPIChains(0, [], [], [])

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.response_time_avg_ms).toBeNull()
  })

  it('calcula response_time_avg_ms correctamente con pares válidos', async () => {
    setupAdminAuth()
    const mensajes = [
      { phone_number: '+54911', role: 'user', created_at: '2026-05-01T10:00:00Z' },
      { phone_number: '+54911', role: 'assistant', created_at: '2026-05-01T10:00:02Z' }, // 2000ms
    ]
    setupAgentKPIChains(0, [], [], mensajes)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.response_time_avg_ms).toBe(2000)
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

  // ── Errores de DB ──────────────────────────────────────────────────────────

  it('retorna 500 si falla la query de escalaciones (audit_logs)', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValueOnce(makeAuditCountChain(null, { message: 'DB error' }))

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('escalaciones')
  })

  it('retorna 500 si falla la query de phone_numbers (conversations)', async () => {
    setupAdminAuth()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeAuditCountChain(2)
      return makeDataChain([], { message: 'DB error' })
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('conversaciones')
  })

  it('retorna 500 si falla la query de takeover phones (audit_logs)', async () => {
    setupAdminAuth()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeAuditCountChain(2)
      if (callCount === 2) return makeDataChain([{ phone_number: '+54911' }])
      return makeAuditDataChain([], { message: 'DB error' })
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('contención')
  })

  it('containment_rate es 100% cuando no hay takevers con conversaciones', async () => {
    setupAdminAuth()
    setupAgentKPIChains(
      0,
      [{ phone_number: '+54911' }, { phone_number: '+54912' }],
      [],
      []
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.containment_rate).toBe(100)
  })
})

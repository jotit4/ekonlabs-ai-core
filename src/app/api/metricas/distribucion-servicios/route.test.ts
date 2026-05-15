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

type AppointmentRow = { service_id: string | null; status: string }
type ServiceRow = { service_id: string; name: string; active: boolean }

/**
 * Chain para appointments: .select().gte().lte().range()
 */
function makeAppointmentsChain(data: AppointmentRow[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  }
}

/**
 * Chain para services: .select() (simple, sin filtros adicionales)
 */
function makeServicesChain(data: ServiceRow[], error: unknown = null) {
  return {
    select: vi.fn().mockResolvedValue({ data, error }),
  }
}

/**
 * Configura mockFrom con ambas chains en orden:
 * 1ª llamada → appointments, 2ª llamada → services
 */
function setupDBChains(appointments: AppointmentRow[], services: ServiceRow[]) {
  let callCount = 0
  mockFrom.mockImplementation(() => {
    callCount++
    if (callCount === 1) return makeAppointmentsChain(appointments)
    return makeServicesChain(services)
  })
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid-1' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIn0.sig' } },
  })
  mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
}

function makeRequest(desde = '2026-05-01T00:00:00-03:00', hasta = '2026-05-13T12:00:00-03:00') {
  return new Request(
    `http://localhost/api/metricas/distribucion-servicios?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/metricas/distribucion-servicios', () => {
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

  it('retorna 403 si el usuario no es admin (receptionist)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el usuario no es admin (doctor)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  // ── Validación de parámetros ───────────────────────────────────────────────

  it('retorna 400 si faltan ambos parámetros desde/hasta', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/distribucion-servicios'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('desde')
  })

  it('retorna 400 si falta solo desde', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/distribucion-servicios?hasta=2026-05-13T12:00:00Z'))
    expect(res.status).toBe(400)
  })

  it('retorna 400 si falta solo hasta', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/distribucion-servicios?desde=2026-05-01T00:00:00Z'))
    expect(res.status).toBe(400)
  })

  it('retorna 400 si las fechas no son ISO 8601 válidas', async () => {
    setupAdminAuth()

    const res = await GET(new Request('http://localhost/api/metricas/distribucion-servicios?desde=invalid-date&hasta=also-invalid'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('ISO 8601')
  })

  it('retorna 400 si desde > hasta (rango invertido)', async () => {
    setupAdminAuth()
    const res = await GET(makeRequest('2026-05-31T23:59:59-03:00', '2026-05-01T00:00:00-03:00'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('El rango de fechas es inválido')
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('retorna 200 con array vacío cuando no hay turnos en el período', async () => {
    setupAdminAuth()
    setupDBChains([], [])

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: unknown[]; total_turnos: number } }
    expect(body.data.servicios).toEqual([])
    expect(body.data.total_turnos).toBe(0)
  })

  it('retorna 200 con distribución correcta cuando hay turnos con servicios', async () => {
    setupAdminAuth()
    setupDBChains(
      [
        { service_id: 'svc-1', status: 'confirmed' },
        { service_id: 'svc-1', status: 'completed' },
        { service_id: 'svc-2', status: 'confirmed' },
      ],
      [
        { service_id: 'svc-1', name: 'Consulta General', active: true },
        { service_id: 'svc-2', name: 'Pediatría', active: true },
      ]
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: Array<{ nombre: string; total: number; porcentaje: number }> ; total_turnos: number } }
    expect(body.data.total_turnos).toBe(3)
    expect(body.data.servicios).toHaveLength(2)
    // Ordenado por total descendente — svc-1 tiene 2 turnos
    expect(body.data.servicios[0].nombre).toBe('Consulta General')
    expect(body.data.servicios[0].total).toBe(2)
    expect(body.data.servicios[0].porcentaje).toBe(67) // Math.round(2/3*100)
    expect(body.data.servicios[1].nombre).toBe('Pediatría')
    expect(body.data.servicios[1].total).toBe(1)
    expect(body.data.servicios[1].porcentaje).toBe(33) // Math.round(1/3*100)
  })

  it('incluye servicios desactivados que tengan turnos históricos en el período', async () => {
    setupAdminAuth()
    setupDBChains(
      [
        { service_id: 'svc-old', status: 'completed' },
        { service_id: 'svc-active', status: 'confirmed' },
      ],
      [
        { service_id: 'svc-old', name: 'Servicio Antiguo', active: false },
        { service_id: 'svc-active', name: 'Servicio Activo', active: true },
      ]
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: Array<{ nombre: string; activo: boolean }> } }
    const historico = body.data.servicios.find(s => s.nombre === 'Servicio Antiguo')
    expect(historico).toBeDefined()
    expect(historico?.activo).toBe(false)
  })

  it('agrupa turnos con service_id null bajo "Sin servicio asignado"', async () => {
    setupAdminAuth()
    setupDBChains(
      [
        { service_id: null, status: 'confirmed' },
        { service_id: null, status: 'completed' },
      ],
      []
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: Array<{ service_id: string | null; nombre: string; activo: boolean }> } }
    expect(body.data.servicios).toHaveLength(1)
    expect(body.data.servicios[0].service_id).toBeNull()
    expect(body.data.servicios[0].nombre).toBe('Sin servicio asignado')
    expect(body.data.servicios[0].activo).toBe(false)
  })

  it('ordena los servicios por total descendente', async () => {
    setupAdminAuth()
    setupDBChains(
      [
        { service_id: 'svc-a', status: 'confirmed' },
        { service_id: 'svc-b', status: 'confirmed' },
        { service_id: 'svc-b', status: 'confirmed' },
        { service_id: 'svc-b', status: 'confirmed' },
        { service_id: 'svc-c', status: 'confirmed' },
        { service_id: 'svc-c', status: 'confirmed' },
      ],
      [
        { service_id: 'svc-a', name: 'A', active: true },
        { service_id: 'svc-b', name: 'B', active: true },
        { service_id: 'svc-c', name: 'C', active: true },
      ]
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: Array<{ nombre: string; total: number }> } }
    expect(body.data.servicios[0].nombre).toBe('B')
    expect(body.data.servicios[0].total).toBe(3)
    expect(body.data.servicios[1].nombre).toBe('C')
    expect(body.data.servicios[1].total).toBe(2)
    expect(body.data.servicios[2].nombre).toBe('A')
    expect(body.data.servicios[2].total).toBe(1)
  })

  it('calcula porcentaje correctamente (Math.round)', async () => {
    setupAdminAuth()
    setupDBChains(
      [
        { service_id: 'svc-1', status: 'confirmed' },
        { service_id: 'svc-1', status: 'confirmed' },
        { service_id: 'svc-2', status: 'confirmed' },
      ],
      [
        { service_id: 'svc-1', name: 'Servicio 1', active: true },
        { service_id: 'svc-2', name: 'Servicio 2', active: true },
      ]
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { servicios: Array<{ nombre: string; porcentaje: number }> } }
    const s1 = body.data.servicios.find(s => s.nombre === 'Servicio 1')
    const s2 = body.data.servicios.find(s => s.nombre === 'Servicio 2')
    // Math.round(2/3*100) = 67, Math.round(1/3*100) = 33
    expect(s1?.porcentaje).toBe(67)
    expect(s2?.porcentaje).toBe(33)
  })

  // ── Errores DB ─────────────────────────────────────────────────────────────

  it('retorna 500 si Supabase lanza error en la query de appointments', async () => {
    setupAdminAuth()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeAppointmentsChain([], { message: 'DB error' })
      return makeServicesChain([])
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('turnos')
  })

  it('retorna 500 si Supabase lanza error en la query de services', async () => {
    setupAdminAuth()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeAppointmentsChain([])
      return makeServicesChain([], { message: 'DB error' })
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('servicios')
  })
})

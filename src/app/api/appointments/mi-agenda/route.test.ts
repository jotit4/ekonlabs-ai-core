import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted ─────────────────────────────────────────────────────────────────

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}))

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupAuth(email = 'patricia@isadi.com.ar') {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-uuid', email } },
    error: null,
  })
}

function setupProfessionalFound(professionalId = 'prof-uuid-1') {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { professional_id: professionalId },
      error: null,
    }),
  }
}

function setupProfessionalNotFound() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    }),
  }
}

function setupAppointmentsQuery(appointments: unknown[] = [], error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: appointments, error }),
  }
}

function makeRequest(fecha?: string): Request {
  const url = fecha
    ? `http://localhost/api/appointments/mi-agenda?fecha=${fecha}`
    : 'http://localhost/api/appointments/mi-agenda'
  return new Request(url)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/appointments/mi-agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 401 si getUser retorna error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('auth error'),
    })

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(401)
  })

  it('retorna 404 si el usuario no está en professionals', async () => {
    setupAuth()
    mockFrom.mockReturnValueOnce(setupProfessionalNotFound())

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Profesional no encontrado para este usuario')
  })

  it('retorna 400 si fecha tiene formato inválido', async () => {
    setupAuth()
    mockFrom.mockReturnValueOnce(setupProfessionalFound())

    const res = await GET(makeRequest('14-05-2026'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Formato de fecha inválido')
  })

  it('retorna 200 con { data: [] } para profesional válido sin turnos', async () => {
    setupAuth()
    mockFrom
      .mockReturnValueOnce(setupProfessionalFound())
      .mockReturnValueOnce(setupAppointmentsQuery([]))

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it('retorna 200 con appointments del profesional logueado', async () => {
    setupAuth()
    const mockAppointment = {
      appointment_id: 'apt-1',
      professional_id: 'prof-uuid-1',
      start_at: '2026-05-14T10:00:00.000Z',
      end_at: '2026-05-14T11:00:00.000Z',
      patients: { full_name: 'Juan García' },
      services: { name: 'Kinesiología', duration_minutes: 60 },
    }

    mockFrom
      .mockReturnValueOnce(setupProfessionalFound('prof-uuid-1'))
      .mockReturnValueOnce(setupAppointmentsQuery([mockAppointment]))

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof mockAppointment[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].professional_id).toBe('prof-uuid-1')
  })

  it('filtra correctamente por professional_id del profesional logueado', async () => {
    setupAuth('aldo@isadi.com.ar')
    const profChain = setupProfessionalFound('aldo-prof-uuid')
    const aptsChain = setupAppointmentsQuery([])

    mockFrom
      .mockReturnValueOnce(profChain)
      .mockReturnValueOnce(aptsChain)

    await GET(makeRequest('2026-05-14'))

    // Verifica que la query de professionals usa el email correcto
    expect(profChain.eq).toHaveBeenCalledWith('email', 'aldo@isadi.com.ar')
    // Verifica que appointments se filtra por professional_id
    expect(aptsChain.eq).toHaveBeenCalledWith('professional_id', 'aldo-prof-uuid')
  })

  it('usa fecha actual si no se provee ?fecha', async () => {
    setupAuth()
    const aptsChain = setupAppointmentsQuery([])

    mockFrom
      .mockReturnValueOnce(setupProfessionalFound())
      .mockReturnValueOnce(aptsChain)

    const res = await GET(new Request('http://localhost/api/appointments/mi-agenda'))
    expect(res.status).toBe(200)

    const todayISO = new Date().toISOString().slice(0, 10)
    expect(aptsChain.gte).toHaveBeenCalledWith('start_at', `${todayISO}T00:00:00.000Z`)
  })

  it('retorna 500 si Supabase falla al consultar appointments', async () => {
    setupAuth()
    const aptsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }

    mockFrom
      .mockReturnValueOnce(setupProfessionalFound())
      .mockReturnValueOnce(aptsChain)

    const res = await GET(makeRequest('2026-05-14'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener los turnos')
  })
})

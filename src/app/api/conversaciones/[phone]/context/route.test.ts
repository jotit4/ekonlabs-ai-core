import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted — factories de mock
const { mockGetUser, mockGetSession, mockFastAPIRequest, mockSupabaseFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFastAPIRequest: vi.fn(),
  mockSupabaseFrom: vi.fn(),
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
      from: mockSupabaseFrom,
    })
  ),
}))

// Mock FastAPIClient
vi.mock('@/lib/fastapi/client', () => {
  class FastAPIError extends Error {
    public readonly status: number
    public readonly body: unknown
    constructor(message: string, status: number, body: unknown) {
      super(message)
      this.name = 'FastAPIError'
      this.status = status
      this.body = body
    }
  }

  class FastAPIClient {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(..._args: unknown[]) {}
    request(...args: unknown[]) {
      return mockFastAPIRequest(...args)
    }
  }

  return { FastAPIClient, FastAPIError }
})

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeRequest(phone: string = '+5491111111111') {
  return new Request(`http://localhost/api/conversaciones/${phone}/context`, { method: 'GET' })
}

function makeContext(phone: string = '+5491111111111') {
  return {
    params: Promise.resolve({ phone }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/conversaciones/[phone]/context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FASTAPI_BASE_URL', 'http://fastapi:8000')
    vi.stubEnv('FASTAPI_API_KEY', 'test-api-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 400 si no hay tenant_id en el JWT', async () => {
    const token = makeJwt({ role: 'receptionist' }) // sin tenant_id
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('tenant_id')
  })

  it('llama a FastAPIClient con el path correcto para el tenant y phone', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const mockContext = {
      patient_name: 'Juan Pérez',
      phone_number: '+5491111111111',
      detected_intent: 'agendar_turno',
    }
    mockFastAPIRequest.mockResolvedValue(mockContext)

    const res = await GET(makeRequest('+5491111111111'), makeContext('+5491111111111'))

    expect(res.status).toBe(200)
    expect(mockFastAPIRequest).toHaveBeenCalledWith(
      '/api/v1/tenants/tenant-uuid-1234/conversations/+5491111111111/context'
    )
    const body = await res.json()
    expect(body.context).toEqual(mockContext)
  })

  it('retorna { context: null } con status 200 cuando FastAPI falla y no hay paciente en Supabase', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    // Simular un error de FastAPI (404, timeout, etc.)
    mockFastAPIRequest.mockRejectedValue(new Error('FastAPI request failed'))

    // Supabase patients → sin resultado
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockSupabaseFrom.mockReturnValue({ select: mockSelect })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toBeNull()
  })

  it('retorna contexto básico del paciente (fallback Supabase) sin turno activo', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    mockFastAPIRequest.mockRejectedValue(new Error('FastAPI request failed'))

    // patients → devuelve paciente
    const patientData = { patient_id: 'p-1', full_name: 'Ana Torres', phone_number: '+5491111111111' }
    const mockPatientMaybeSingle = vi.fn().mockResolvedValue({ data: patientData })
    const mockPatientEq = vi.fn().mockReturnValue({ maybeSingle: mockPatientMaybeSingle })
    const mockPatientSelect = vi.fn().mockReturnValue({ eq: mockPatientEq })

    // appointments → sin turno activo
    const mockApptMaybeSingle = vi.fn().mockResolvedValue({ data: null })
    const mockApptLimit = vi.fn().mockReturnValue({ maybeSingle: mockApptMaybeSingle })
    const mockApptOrder = vi.fn().mockReturnValue({ limit: mockApptLimit })
    const mockApptIn = vi.fn().mockReturnValue({ order: mockApptOrder })
    const mockApptEq = vi.fn().mockReturnValue({ in: mockApptIn })
    const mockApptSelect = vi.fn().mockReturnValue({ eq: mockApptEq })

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'patients') return { select: mockPatientSelect }
      if (table === 'appointments') return { select: mockApptSelect }
      return { select: vi.fn() }
    })

    const res = await GET(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toEqual({
      patient_name: 'Ana Torres',
      phone_number: '+5491111111111',
    })
  })

  it('enriquece el fallback con el turno activo del paciente', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    mockFastAPIRequest.mockRejectedValue(new Error('FastAPI request failed'))

    const patientData = { patient_id: 'p-1', full_name: 'Carlos Ruiz', phone_number: '+5491122334455' }
    const mockPatientMaybeSingle = vi.fn().mockResolvedValue({ data: patientData })
    const mockPatientEq = vi.fn().mockReturnValue({ maybeSingle: mockPatientMaybeSingle })
    const mockPatientSelect = vi.fn().mockReturnValue({ eq: mockPatientEq })

    const appointmentData = {
      start_at: '2026-06-01T10:00:00+00:00',
      status: 'confirmed',
      services: { name: 'Kinesiología' },
    }
    const mockApptMaybeSingle = vi.fn().mockResolvedValue({ data: appointmentData })
    const mockApptLimit = vi.fn().mockReturnValue({ maybeSingle: mockApptMaybeSingle })
    const mockApptOrder = vi.fn().mockReturnValue({ limit: mockApptLimit })
    const mockApptIn = vi.fn().mockReturnValue({ order: mockApptOrder })
    const mockApptEq = vi.fn().mockReturnValue({ in: mockApptIn })
    const mockApptSelect = vi.fn().mockReturnValue({ eq: mockApptEq })

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'patients') return { select: mockPatientSelect }
      if (table === 'appointments') return { select: mockApptSelect }
      return { select: vi.fn() }
    })

    const res = await GET(makeRequest('+5491122334455'), makeContext('+5491122334455'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toEqual({
      patient_name: 'Carlos Ruiz',
      phone_number: '+5491122334455',
      service_requested: 'Kinesiología',
      slot_requested: '2026-06-01T10:00:00+00:00',
      detected_intent: 'Turno confirmado',
    })
  })

  it('retorna { context: AgentContext } cuando FastAPI responde correctamente', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234' })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const agentContext = {
      patient_name: 'María García',
      phone_number: '+5491122334455',
      detected_intent: 'cancelar_turno',
      dni: '30123456',
      service_requested: 'Kinesiología',
      slot_requested: '2026-05-15T10:00:00',
      availability_info: null,
      obra_social: 'OSDE',
      current_block: null,
      is_resolved: false,
    }
    mockFastAPIRequest.mockResolvedValue(agentContext)

    const res = await GET(makeRequest('+5491122334455'), makeContext('+5491122334455'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.context).toEqual(agentContext)
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser, mockGetSession, mockFrom, mockInsert, mockMaybeSingle, mockInsertSingle } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetSession: vi.fn(),
    mockFrom: vi.fn(),
    mockInsert: vi.fn(),
    mockMaybySingle: vi.fn(),
    mockMaybeSingle: vi.fn(),
    mockInsertSingle: vi.fn(),
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

// Mock logAudit
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234', app_role: 'receptionist' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeRequest(body: unknown = {}) {
  return new Request('http://localhost/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  full_name: 'María García',
  phone_number: '1133334444',
  dni: '',
  date_of_birth: '',
  email: '',
  obra_social: '',
  obra_social_number: '',
  notes: '',
  reason_for_visit: '',
  alternative_phone: '',
  address: '',
  lugar: '',
  ocupacion: '',
  derivacion: '',
  actividad_fisica: '',
  primary_professional_id: '',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/patients', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const token = makeJwt()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    // Default: no DNI conflict → maybySingle returns null
    // Default: insert succeeds → returns patient_id
    // DNI check chain: .select().eq('tenant_id', ...).eq('dni', ...).maybeSingle()
    const mockEqDni = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockEqTenant = vi.fn(() => ({ eq: mockEqDni }))
    const mockSelect = vi.fn(() => ({ eq: mockEqTenant }))
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const mockInsertChain = {
      select: vi.fn(() => ({ single: mockInsertSingle })),
    }
    mockInsert.mockReturnValue(mockInsertChain)
    mockInsertSingle.mockResolvedValue({
      data: { patient_id: 'new-patient-uuid' },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    })
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 403 si el role no es receptionist ni admin', async () => {
    const token = makeJwt({ tenant_id: 'tenant-uuid-1234', app_role: 'doctor' })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/rol/i)
  })

  it('retorna 400 si el body es inválido (full_name muy corto)', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, full_name: 'A' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 409 si el DNI ya existe', async () => {
    // Simular que ya existe un paciente con ese DNI
    // DNI check chain: .select().eq('tenant_id', ...).eq('dni', ...).maybeSingle()
    const mockEqDni = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockEqTenant = vi.fn(() => ({ eq: mockEqDni }))
    const mockSelect = vi.fn(() => ({ eq: mockEqTenant }))
    mockMaybeSingle.mockResolvedValue({ data: { patient_id: 'existing-id' }, error: null })
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert })

    const res = await POST(makeRequest({ ...VALID_BODY, dni: '30123456' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('DNI')
  })

  it('retorna 201 + patient_id en POST válido', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.patient).toBeDefined()
    expect(body.patient.patient_id).toBe('new-patient-uuid')
  })

  it('el tenant_id se toma del JWT — nunca del body', async () => {
    const bodyWithTenantId = { ...VALID_BODY, tenant_id: 'malicious-tenant-id' }
    await POST(makeRequest(bodyWithTenantId))

    // El insert debe haber sido llamado con tenant_id del JWT, no del body
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-uuid-1234' })
    )
    // tenant_id del body no debe aparecer en la llamada
    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall.tenant_id).toBe('tenant-uuid-1234')
  })

  // ─── Ficha de admisión (migración 047 — Fase 1 digitalización) ──────────────
  it('persiste los campos administrativos de la ficha de admisión (lugar/ocupacion/derivacion/actividad_fisica/primary_professional_id)', async () => {
    const professionalId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    const bodyWithFicha = {
      ...VALID_BODY,
      lugar: 'Mendoza',
      ocupacion: 'Docente',
      derivacion: 'Dr. Pérez',
      actividad_fisica: 'Running 3x semana',
      primary_professional_id: professionalId,
    }
    const res = await POST(makeRequest(bodyWithFicha))
    expect(res.status).toBe(201)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lugar: 'Mendoza',
        ocupacion: 'Docente',
        derivacion: 'Dr. Pérez',
        actividad_fisica: 'Running 3x semana',
        primary_professional_id: professionalId,
      })
    )
  })

  it('strings vacíos de la ficha de admisión se insertan como null', async () => {
    await POST(makeRequest(VALID_BODY))

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lugar: null,
        ocupacion: null,
        derivacion: null,
        actividad_fisica: null,
        primary_professional_id: null,
      })
    )
  })

  it('no persiste `cirugias` (clínico) vía el POST administrativo — Zod lo stripea', async () => {
    const bodyWithCirugias = { ...VALID_BODY, cirugias: 'Apendicectomía inyectada por receptionist' }
    const res = await POST(makeRequest(bodyWithCirugias))
    expect(res.status).toBe(201)

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall).not.toHaveProperty('cirugias')
  })
})

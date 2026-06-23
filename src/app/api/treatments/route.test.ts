import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' }),
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

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}))

import { POST } from './route'

const PROF_A = '98c80b43-3f4a-4aa0-84ba-02be20fe6bcd'
const PATIENT = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const SERVICE = 'f38f1191-3e0d-4f60-bcd2-e647c2b899da'
const NEW_TREATMENT_ID = 'b98932dc-949b-4dff-9aca-c86031a5f4a5'

// Builder de service_professionals: .select().eq('service_id').eq('professional_id')
// resuelve a { data, error }. El profesional es ÚNICO (un solo .eq por profesional,
// ya no .in() de varios slots).
function makeServiceProfBuilder(rows: { professional_id: string }[], error: unknown = null) {
  let eqCount = 0
  const builder = {
    select: vi.fn(() => builder),
    // El 2º .eq (professional_id) es terminal y resuelve la promesa.
    eq: vi.fn(() => {
      eqCount += 1
      return eqCount >= 2 ? Promise.resolve({ data: rows, error }) : builder
    }),
  }
  return builder
}

// Builder de treatments: .insert().select().single() resuelve a { data, error }
let lastInsertPayload: Record<string, unknown> | null = null
function makeTreatmentsBuilder(
  data: { treatment_id: string } | null,
  error: unknown = null,
) {
  const builder = {
    insert: vi.fn((payload: Record<string, unknown>) => {
      lastInsertPayload = payload
      return builder
    }),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data, error })),
  }
  return builder
}

interface FromConfig {
  spRows?: { professional_id: string }[]
  spError?: unknown
  insertData?: { treatment_id: string } | null
  insertError?: unknown
}

function configureFrom(cfg: FromConfig) {
  const spRows = cfg.spRows ?? [{ professional_id: PROF_A }]
  mockFrom.mockImplementation((table: string) => {
    if (table === 'service_professionals') return makeServiceProfBuilder(spRows, cfg.spError ?? null)
    if (table === 'treatments')
      return makeTreatmentsBuilder(
        cfg.insertData === undefined ? { treatment_id: NEW_TREATMENT_ID } : cfg.insertData,
        cfg.insertError ?? null,
      )
    throw new Error(`unexpected table ${table}`)
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    patient_id: PATIENT,
    service_id: SERVICE,
    professional_id: PROF_A,
    total_sessions: 10,
    start_date: '2026-06-10',
    pattern: {
      slots: [
        { day_of_week: 1, time: '10:00' },
        { day_of_week: 4, time: '16:00' },
      ],
    },
    ...overrides,
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/treatments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/treatments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastInsertPayload = null
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockLogAudit.mockResolvedValue(undefined)
    configureFrom({})
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(401)
  })

  it('401 si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(401)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(400)
  })

  it('403 si el rol es doctor', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(403)
  })

  it('permite rol receptionist', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(201)
  })

  it('400 si el body no es JSON', async () => {
    const req = new Request('http://localhost/api/treatments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 si el pattern está vacío', async () => {
    const res = await POST(makeRequest(validBody({ pattern: { slots: [] } })))
    expect(res.status).toBe(400)
  })

  it('400 si day_of_week está fuera de 0..6', async () => {
    const res = await POST(
      makeRequest(
        validBody({ pattern: { slots: [{ day_of_week: 7, time: '10:00', professional_id: PROF_A }] } }),
      ),
    )
    expect(res.status).toBe(400)
  })

  it('400 si time está mal formado', async () => {
    const res = await POST(
      makeRequest(
        validBody({ pattern: { slots: [{ day_of_week: 1, time: '9:00', professional_id: PROF_A }] } }),
      ),
    )
    expect(res.status).toBe(400)
  })

  it('400 si total_sessions <= 0', async () => {
    const res = await POST(makeRequest(validBody({ total_sessions: 0 })))
    expect(res.status).toBe(400)
  })

  it('400 si el profesional del paquete no atiende el servicio', async () => {
    // El profesional (único) es PROF_A pero service_professionals no lo devuelve.
    configureFrom({ spRows: [] })
    const res = await POST(
      makeRequest(
        validBody({
          professional_id: PROF_A,
          pattern: { slots: [{ day_of_week: 1, time: '10:00' }] },
        }),
      ),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain(PROF_A)
  })

  it('500 si el check de service_professionals falla', async () => {
    configureFrom({ spError: { message: 'sp fail' } })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
  })

  it('500 si el insert falla', async () => {
    configureFrom({ insertData: null, insertError: { message: 'insert fail' } })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
  })

  it('201 + inserta sessions_remaining = total_sessions y status active', async () => {
    const res = await POST(makeRequest(validBody({ total_sessions: 10 })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.treatment_id).toBe(NEW_TREATMENT_ID)

    expect(lastInsertPayload).toMatchObject({
      tenant_id: 'tenant-1',
      patient_id: PATIENT,
      service_id: SERVICE,
      professional_id: PROF_A,
      total_sessions: 10,
      sessions_remaining: 10,
      start_date: '2026-06-10',
      status: 'active',
      expires_at: null,
      created_by: 'user-1',
    })
    // pattern persistido tal cual (2 slots)
    expect((lastInsertPayload?.pattern as { slots: unknown[] }).slots).toHaveLength(2)
  })

  it('tenant_id insertado proviene del JWT, no del body', async () => {
    await POST(makeRequest(validBody({ tenant_id: 'evil-tenant' })))
    expect(lastInsertPayload?.tenant_id).toBe('tenant-1')
  })

  it('persiste expires_at cuando viene', async () => {
    await POST(makeRequest(validBody({ expires_at: '2026-12-31' })))
    expect(lastInsertPayload?.expires_at).toBe('2026-12-31')
  })

  it('llama logAudit con treatment_created / treatment / treatment_id tras el insert', async () => {
    await POST(makeRequest(validBody()))
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_created',
        entity_type: 'treatment',
        entity_id: NEW_TREATMENT_ID,
      }),
    )
  })

  it('NO llama logAudit si el insert falla', async () => {
    configureFrom({ insertData: null, insertError: { message: 'insert fail' } })
    await POST(makeRequest(validBody()))
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

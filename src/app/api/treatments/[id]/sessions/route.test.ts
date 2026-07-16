import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockRpc, mockFrom, mockParseJwt, mockLogAudit } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockGetSession: vi.fn(),
    mockRpc: vi.fn(),
    mockFrom: vi.fn(),
    mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' }),
    mockLogAudit: vi.fn().mockResolvedValue(undefined),
  }),
)

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      rpc: mockRpc,
      from: mockFrom,
    }),
  ),
}))
vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

import { POST } from './route'

const PROF = '98c80b43-3f4a-4aa0-84ba-02be20fe6bcd'
const PATIENT = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const SERVICE = 'f38f1191-3e0d-4f60-bcd2-e647c2b899da'
const TREATMENT_ID = 'b98932dc-949b-4dff-9aca-c86031a5f4a5'

function defaultTreatment(
  overrides: Record<string, unknown> = {},
  appointments: { session_index: number | null; status: string }[] = [],
) {
  return {
    treatment_id: TREATMENT_ID,
    patient_id: PATIENT,
    service_id: SERVICE,
    professional_id: PROF,
    total_sessions: 10,
    status: 'active',
    appointments,
    ...overrides,
  }
}

interface FromConfig {
  treatment?: Record<string, unknown> | null
  treatmentLoadError?: unknown
  updatedApptIds?: string[]
  updatePayloads?: Record<string, unknown>[]
}

function configureFrom(cfg: FromConfig) {
  cfg.updatedApptIds = cfg.updatedApptIds ?? []
  cfg.updatePayloads = cfg.updatePayloads ?? []

  mockFrom.mockImplementation((table: string) => {
    if (table === 'treatments') {
      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data: cfg.treatment === undefined ? defaultTreatment() : cfg.treatment,
            error: cfg.treatmentLoadError ?? null,
          }),
        ),
      }
      return builder
    }
    if (table === 'appointments') {
      let payload: Record<string, unknown> | null = null
      const builder: Record<string, unknown> = {
        update: vi.fn((p: Record<string, unknown>) => {
          payload = p
          return builder
        }),
        eq: vi.fn((_col: string, id: string) => {
          cfg.updatedApptIds!.push(id)
          if (payload) cfg.updatePayloads!.push(payload)
          return Promise.resolve({ error: null })
        }),
      }
      return builder
    }
    throw new Error(`unexpected table ${table}`)
  })
}

// RPC create_appointment: por defecto crea un turno NUEVO con id determinístico.
function rpcCreates(rows?: Array<{ success: boolean; appointment_id: string | null; duplicate: boolean; error?: string | null }>) {
  let i = 0
  mockRpc.mockImplementation((_fn: string, args: { p_appointment_id: string }) => {
    if (rows && rows[i]) {
      const r = rows[i++]
      return Promise.resolve({
        data: [{ success: r.success, appointment_id: r.appointment_id, short_id: null, duplicate: r.duplicate, error: r.error ?? null }],
        error: null,
      })
    }
    i++
    return Promise.resolve({
      data: [{ success: true, appointment_id: args.p_appointment_id, short_id: null, duplicate: false, error: null }],
      error: null,
    })
  })
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/treatments/${TREATMENT_ID}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams() {
  return { params: Promise.resolve({ id: TREATMENT_ID }) }
}

function validBody(n = 2) {
  return {
    slots: Array.from({ length: n }, (_, i) => ({
      start_at: `2026-06-${10 + i}T13:00:00.000Z`,
      end_at: `2026-06-${10 + i}T14:00:00.000Z`,
    })),
  }
}

describe('POST /api/treatments/[id]/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockLogAudit.mockResolvedValue(undefined)
    configureFrom({})
    rpcCreates()
  })

  it('401 sin usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(401)
  })

  it('400 sin tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(400)
  })

  it('403 si el rol es doctor', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(403)
  })

  it('400 si slots vacío', async () => {
    const res = await POST(makeRequest({ slots: [] }), makeParams())
    expect(res.status).toBe(400)
  })

  it('404 si el paquete no existe', async () => {
    configureFrom({ treatment: null })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(404)
  })

  it('409 si el paquete no está activo', async () => {
    configureFrom({ treatment: defaultTreatment({ status: 'completed' }) })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(409)
  })

  it('422 si el paquete no tiene profesional fijo Y los slots no traen professional_id', async () => {
    configureFrom({ treatment: defaultTreatment({ professional_id: null }) })
    const res = await POST(makeRequest(validBody()), makeParams())
    expect(res.status).toBe(422)
  })

  it('422 si se eligen más sesiones que las que faltan agendar', async () => {
    // total=2, ya hay 1 confirmed → por_agendar=1, pero se piden 2.
    configureFrom({
      treatment: defaultTreatment({ total_sessions: 2 }, [{ session_index: 1, status: 'confirmed' }]),
    })
    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(422)
  })

  it('409 si el paquete ya tiene todo agendado', async () => {
    configureFrom({
      treatment: defaultTreatment({ total_sessions: 1 }, [{ session_index: 1, status: 'confirmed' }]),
    })
    const res = await POST(makeRequest(validBody(1)), makeParams())
    expect(res.status).toBe(409)
  })

  it('201 crea las sesiones vía RPC create_appointment y las liga al paquete', async () => {
    const cfg: FromConfig = {}
    configureFrom(cfg)
    rpcCreates()

    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.creadas).toBe(2)

    // Se llamó la RPC anti-overbooking 2 veces con el profesional del paquete.
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc).toHaveBeenCalledWith(
      'create_appointment',
      expect.objectContaining({
        p_org_id: 'tenant-1',
        p_professional_id: PROF,
        p_patient_id: PATIENT,
        p_service_id: SERVICE,
        p_booked_via: 'manual',
      }),
    )
    // Cada turno se ligó con package_id + session_index correlativo (1, 2).
    expect(cfg.updatePayloads).toEqual([
      { package_id: TREATMENT_ID, session_index: 1 },
      { package_id: TREATMENT_ID, session_index: 2 },
    ])
  })

  it('session_index continúa desde el max existente del paquete', async () => {
    const cfg: FromConfig = {
      treatment: defaultTreatment({ total_sessions: 10 }, [
        { session_index: 3, status: 'completed' },
        { session_index: 5, status: 'confirmed' },
      ]),
    }
    configureFrom(cfg)
    rpcCreates()

    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(201)
    // max existente = 5 → nuevos = 6, 7.
    expect(cfg.updatePayloads).toEqual([
      { package_id: TREATMENT_ID, session_index: 6 },
      { package_id: TREATMENT_ID, session_index: 7 },
    ])
  })

  it('409 si TODOS los slots resultan duplicados (slot ocupado)', async () => {
    configureFrom({})
    rpcCreates([
      { success: true, appointment_id: 'existing-1', duplicate: true },
      { success: true, appointment_id: 'existing-2', duplicate: true },
    ])
    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.creadas).toBe(0)
  })

  it('tenant_id usado en la RPC proviene del JWT, no del body', async () => {
    configureFrom({})
    rpcCreates()
    await POST(makeRequest({ ...validBody(1), tenant_id: 'evil' }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'create_appointment',
      expect.objectContaining({ p_org_id: 'tenant-1' }),
    )
  })

  it('audita treatment_sessions_scheduled cuando creó al menos una', async () => {
    configureFrom({})
    rpcCreates()
    await POST(makeRequest(validBody(1)), makeParams())
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_sessions_scheduled',
        entity_type: 'treatment',
        entity_id: TREATMENT_ID,
      }),
    )
  })

  describe('Pedido A #2/#3 (ISADI 2026-07-14) — paquete sin profesional fijo ("cualquier profesional")', () => {
    const PROF_2 = '0bff67bd-87b2-41b9-bd93-1a37f3d335a2'

    function anyBody(slots: { start_at: string; end_at: string; professional_id?: string }[]) {
      return { slots }
    }

    it('201 usa el professional_id de CADA slot (no el del paquete, que es null)', async () => {
      configureFrom({ treatment: defaultTreatment({ professional_id: null }) })
      rpcCreates()

      const res = await POST(
        makeRequest(
          anyBody([
            { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF },
            { start_at: '2026-06-11T13:00:00.000Z', end_at: '2026-06-11T14:00:00.000Z', professional_id: PROF_2 },
          ]),
        ),
        makeParams(),
      )
      expect(res.status).toBe(201)
      expect(mockRpc).toHaveBeenNthCalledWith(
        1,
        'create_appointment',
        expect.objectContaining({ p_professional_id: PROF }),
      )
      expect(mockRpc).toHaveBeenNthCalledWith(
        2,
        'create_appointment',
        expect.objectContaining({ p_professional_id: PROF_2 }),
      )
    })

    it('422 si falta professional_id en AL MENOS un slot', async () => {
      configureFrom({ treatment: defaultTreatment({ professional_id: null }) })
      const res = await POST(
        makeRequest(
          anyBody([
            { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF },
            { start_at: '2026-06-11T13:00:00.000Z', end_at: '2026-06-11T14:00:00.000Z' },
          ]),
        ),
        makeParams(),
      )
      expect(res.status).toBe(422)
    })

    it('con profesional FIJO en el paquete, ignora professional_id que traiga el slot y usa el del paquete', async () => {
      configureFrom({}) // paquete con professional_id = PROF (default)
      rpcCreates()
      const res = await POST(
        makeRequest(anyBody([{ start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF_2 }])),
        makeParams(),
      )
      expect(res.status).toBe(201)
      expect(mockRpc).toHaveBeenCalledWith(
        'create_appointment',
        expect.objectContaining({ p_professional_id: PROF }),
      )
    })
  })

  describe('Pedido 6 (ISADI 2026-07-14/16) — color único de la tanda', () => {
    it('sin color en el body, el UPDATE que liga package_id/session_index NO lleva color', async () => {
      const cfg: FromConfig = {}
      configureFrom(cfg)
      rpcCreates()

      const res = await POST(makeRequest(validBody(2)), makeParams())
      expect(res.status).toBe(201)
      expect(cfg.updatePayloads).toEqual([
        { package_id: TREATMENT_ID, session_index: 1 },
        { package_id: TREATMENT_ID, session_index: 2 },
      ])
    })

    it('con color en el body, TODOS los turnos creados se ligan con ESE color', async () => {
      const cfg: FromConfig = {}
      configureFrom(cfg)
      rpcCreates()

      const res = await POST(makeRequest({ ...validBody(2), color: '#00FFFF' }), makeParams())
      expect(res.status).toBe(201)
      expect(cfg.updatePayloads).toEqual([
        { package_id: TREATMENT_ID, session_index: 1, color: '#00FFFF' },
        { package_id: TREATMENT_ID, session_index: 2, color: '#00FFFF' },
      ])
    })

    it('400 si el color no tiene formato hex válido', async () => {
      const res = await POST(makeRequest({ ...validBody(1), color: 'cyan' }), makeParams())
      expect(res.status).toBe(400)
    })
  })
})

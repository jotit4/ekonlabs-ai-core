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
}

// El route SOLO consulta `treatments` (carga para las validaciones de UX). La
// creación + ligado los hace la RPC atómica create_package_sessions (054): el
// route ya NO toca `appointments` por su cuenta. El throw en cualquier otra tabla
// es una aserción implícita de que ese UPDATE por separado desapareció.
function configureFrom(cfg: FromConfig) {
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
    throw new Error(`unexpected table ${table}`)
  })
}

// RPC create_package_sessions: por defecto reporta creadas = cantidad de slots
// recibidos, skipped vacío (todos creados). Con `result`, devuelve ese resumen
// exacto. Con `error`, simula un fallo duro de la RPC.
function rpcSessions(opts: {
  result?: { creadas: number; skipped?: { start_at?: string; reason: string }[] }
  error?: unknown
} = {}) {
  mockRpc.mockImplementation((fn: string, args: { p_slots?: unknown[] }) => {
    if (fn !== 'create_package_sessions') {
      return Promise.resolve({ data: null, error: null })
    }
    if (opts.error) return Promise.resolve({ data: null, error: opts.error })
    if (opts.result) {
      return Promise.resolve({
        data: [{ creadas: opts.result.creadas, skipped: opts.result.skipped ?? [] }],
        error: null,
      })
    }
    const n = Array.isArray(args.p_slots) ? args.p_slots.length : 0
    return Promise.resolve({ data: [{ creadas: n, skipped: [] }], error: null })
  })
}

function rpcCall() {
  return mockRpc.mock.calls.find((c) => c[0] === 'create_package_sessions')
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
    rpcSessions()
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

  it('201 crea las sesiones vía la RPC atómica create_package_sessions', async () => {
    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.creadas).toBe(2)

    // Una sola llamada a la RPC atómica con TODOS los slots (no una por slot).
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(
      'create_package_sessions',
      expect.objectContaining({
        p_org_id: 'tenant-1',
        p_treatment_id: TREATMENT_ID,
        p_color: null,
        p_booked_via: 'manual',
      }),
    )
    // Los slots viajan con el profesional FIJO del paquete resuelto por slot.
    expect(rpcCall()![1].p_slots).toEqual([
      { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF },
      { start_at: '2026-06-11T13:00:00.000Z', end_at: '2026-06-11T14:00:00.000Z', professional_id: PROF },
    ])
    // El route NO calcula el índice ni hace un UPDATE propio de appointments:
    // la RPC es autoridad del session_index/cupo bajo lock.
    expect(mockFrom).not.toHaveBeenCalledWith('appointments')
  })

  it('201 parcial: reporta creadas y skipped tal como los devuelve la RPC', async () => {
    // Cupo llenado por una carrera: la RPC crea 1 y saltea 1 (no_capacity).
    rpcSessions({ result: { creadas: 1, skipped: [{ start_at: '2026-06-11T13:00:00.000Z', reason: 'no_capacity' }] } })
    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creadas).toBe(1)
    expect(body.skipped).toEqual([{ start_at: '2026-06-11T13:00:00.000Z', reason: 'no_capacity' }])
  })

  it('409 si TODOS los slots resultan conflicto de slot (ocupado)', async () => {
    rpcSessions({
      result: {
        creadas: 0,
        skipped: [
          { start_at: '2026-06-10T13:00:00.000Z', reason: 'slot_conflict' },
          { start_at: '2026-06-11T13:00:00.000Z', reason: 'slot_conflict' },
        ],
      },
    })
    const res = await POST(makeRequest(validBody(2)), makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.creadas).toBe(0)
    // creadas=0 → NO se audita.
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('409 si el cupo se agotó por una carrera (todos no_capacity)', async () => {
    rpcSessions({ result: { creadas: 0, skipped: [{ start_at: '2026-06-10T13:00:00.000Z', reason: 'no_capacity' }] } })
    const res = await POST(makeRequest(validBody(1)), makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/ya tiene todas/i)
  })

  it('500 si la RPC devuelve un error duro', async () => {
    rpcSessions({ error: { message: 'boom' } })
    const res = await POST(makeRequest(validBody(1)), makeParams())
    expect(res.status).toBe(500)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('tenant_id usado en la RPC proviene del JWT, no del body', async () => {
    await POST(makeRequest({ ...validBody(1), tenant_id: 'evil' }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'create_package_sessions',
      expect.objectContaining({ p_org_id: 'tenant-1' }),
    )
  })

  it('audita treatment_sessions_scheduled cuando creó al menos una', async () => {
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

    it('201 pasa a la RPC el professional_id de CADA slot (no el del paquete, que es null)', async () => {
      configureFrom({ treatment: defaultTreatment({ professional_id: null }) })
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
      expect(rpcCall()![1].p_slots).toEqual([
        { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF },
        { start_at: '2026-06-11T13:00:00.000Z', end_at: '2026-06-11T14:00:00.000Z', professional_id: PROF_2 },
      ])
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

    it('con profesional FIJO en el paquete, ignora el professional_id del slot y usa el del paquete', async () => {
      configureFrom({}) // paquete con professional_id = PROF (default)
      const res = await POST(
        makeRequest(anyBody([{ start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF_2 }])),
        makeParams(),
      )
      expect(res.status).toBe(201)
      expect(rpcCall()![1].p_slots).toEqual([
        { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z', professional_id: PROF },
      ])
    })
  })

  describe('Pedido 6 (ISADI 2026-07-14/16) — color único de la tanda', () => {
    it('sin color en el body, la RPC recibe p_color null', async () => {
      const res = await POST(makeRequest(validBody(2)), makeParams())
      expect(res.status).toBe(201)
      expect(rpcCall()![1].p_color).toBeNull()
    })

    it('con color en el body, la RPC recibe ESE color (aplicado a toda la tanda)', async () => {
      const res = await POST(makeRequest({ ...validBody(2), color: '#00FFFF' }), makeParams())
      expect(res.status).toBe(201)
      expect(rpcCall()![1].p_color).toBe('#00FFFF')
    })

    it('400 si el color no tiene formato hex válido', async () => {
      const res = await POST(makeRequest({ ...validBody(1), color: 'cyan' }), makeParams())
      expect(res.status).toBe(400)
    })
  })
})

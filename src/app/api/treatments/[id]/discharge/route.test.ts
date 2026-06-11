import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' }),
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

const TREATMENT_ID = 'b98932dc-949b-4dff-9aca-c86031a5f4a5'
const PATIENT_ID = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const PLAN_ID = '7c1f2f59-67e8-4e3d-9a51-0a40c7a4f111'

function makePlanRow(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: PLAN_ID,
    tenant_id: 'tenant-1',
    treatment_id: TREATMENT_ID,
    patient_id: PATIENT_ID,
    motivo_consulta: 'Lumbalgia',
    objetivo: 'Reducir dolor',
    cie10_code: 'M54.5',
    indicated_sessions: 10,
    discharge_at: '2026-06-11T12:00:00.000Z',
    discharge_report: 'Paciente recuperado.',
    author_id: 'user-1',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-11T12:00:00Z',
    ...overrides,
  }
}

// ── Builders por tabla ─────────────────────────────────────────────────────────
// treatments: .select().eq().maybeSingle() (lectura) y .update(payload, {count}).eq()
// (escritura del status — thenable que resuelve { error, count }).
let lastTreatmentUpdatePayload: Record<string, unknown> | null = null
let lastTreatmentUpdateOptions: Record<string, unknown> | null = null
function makeTreatmentsBuilder(cfg: {
  row?: { treatment_id: string; status: string } | null
  readError?: unknown
  updateError?: unknown
  updateCount?: number
}) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: cfg.row === undefined ? { treatment_id: TREATMENT_ID, status: 'active' } : cfg.row,
      error: cfg.readError ?? null,
    }),
  )
  builder.update = vi.fn((payload: Record<string, unknown>, options: Record<string, unknown>) => {
    lastTreatmentUpdatePayload = payload
    lastTreatmentUpdateOptions = options
    const updateChain = {
      eq: vi.fn(() =>
        Promise.resolve({
          error: cfg.updateError ?? null,
          count: cfg.updateCount === undefined ? 1 : cfg.updateCount,
        }),
      ),
    }
    return updateChain
  })
  builder.eq = vi.fn(() => builder)
  return builder
}

// treatment_plans: .select().eq().maybeSingle() (lectura) y
// .update(payload).eq().select().single() (sello del alta).
let lastPlanUpdatePayload: Record<string, unknown> | null = null
let lastPlanUpdateEqArgs: unknown[] | null = null
function makePlansBuilder(cfg: {
  selectData?: Record<string, unknown> | null
  selectError?: unknown
  updateData?: Record<string, unknown> | null
  updateError?: unknown
}) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: cfg.selectData ?? null, error: cfg.selectError ?? null }),
  )
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    lastPlanUpdatePayload = payload
    const updateChain = {
      eq: vi.fn((...args: unknown[]) => {
        lastPlanUpdateEqArgs = args
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: cfg.updateData === undefined ? makePlanRow() : cfg.updateData,
                error: cfg.updateError ?? null,
              }),
            ),
          })),
        }
      }),
    }
    return updateChain
  })
  return builder
}

interface FromConfig {
  treatmentRow?: { treatment_id: string; status: string } | null
  treatmentReadError?: unknown
  treatmentUpdateError?: unknown
  treatmentUpdateCount?: number
  planSelectData?: Record<string, unknown> | null
  planSelectError?: unknown
  planUpdateData?: Record<string, unknown> | null
  planUpdateError?: unknown
}

function configureFrom(cfg: FromConfig = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'treatments')
      return makeTreatmentsBuilder({
        row: cfg.treatmentRow,
        readError: cfg.treatmentReadError,
        updateError: cfg.treatmentUpdateError,
        updateCount: cfg.treatmentUpdateCount,
      })
    if (table === 'treatment_plans')
      return makePlansBuilder({
        selectData:
          cfg.planSelectData === undefined
            ? { plan_id: PLAN_ID, discharge_at: null }
            : cfg.planSelectData,
        selectError: cfg.planSelectError,
        updateData: cfg.planUpdateData,
        updateError: cfg.planUpdateError,
      })
    throw new Error(`unexpected table ${table}`)
  })
}

const context = { params: Promise.resolve({ id: TREATMENT_ID }) }

function makeRequest(body: unknown, id: string = TREATMENT_ID) {
  return new Request(`http://localhost/api/treatments/${id}/discharge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { discharge_report: 'Paciente recuperado.' }

beforeEach(() => {
  vi.clearAllMocks()
  lastTreatmentUpdatePayload = null
  lastTreatmentUpdateOptions = null
  lastPlanUpdatePayload = null
  lastPlanUpdateEqArgs = null
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
  mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
  mockLogAudit.mockResolvedValue(undefined)
  configureFrom()
})

describe('POST /api/treatments/[id]/discharge — guards', () => {
  it('400 si el id no es un UUID (antes de tocar la DB)', async () => {
    const badContext = { params: Promise.resolve({ id: 'not-a-uuid' }) }
    const res = await POST(makeRequest(validBody, 'not-a-uuid'), badContext)
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(401)
  })

  it('401 si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(401)
  })

  it('403 si el rol es receptionist (HCE — Ley 25.326), sin tocar la DB', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('permite rol admin (200)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(200)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(400)
  })

  it('400 si el body no es JSON', async () => {
    const req = new Request(`http://localhost/api/treatments/${TREATMENT_ID}/discharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    })
    const res = await POST(req, context)
    expect(res.status).toBe(400)
  })

  it('400 si falta discharge_report (con details)', async () => {
    const res = await POST(makeRequest({}), context)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Datos inválidos')
    expect(body.details).toBeDefined()
    expect(lastPlanUpdatePayload).toBeNull()
  })

  it('400 si discharge_report es solo espacios', async () => {
    const res = await POST(makeRequest({ discharge_report: '   ' }), context)
    expect(res.status).toBe(400)
  })

  it('400 si viene discharge_at en el body (anti-backdating — strictObject)', async () => {
    const res = await POST(
      makeRequest({ ...validBody, discharge_at: '2020-01-01T00:00:00Z' }),
      context,
    )
    expect(res.status).toBe(400)
    expect(lastPlanUpdatePayload).toBeNull()
  })

  it('400 si viene tenant_id en el body (strictObject)', async () => {
    const res = await POST(makeRequest({ ...validBody, tenant_id: 'evil' }), context)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/treatments/[id]/discharge — precondiciones de dominio', () => {
  it('404 si el treatment no existe (o es de otro tenant — RLS lo oculta)', async () => {
    configureFrom({ treatmentRow: null })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(404)
    expect(lastPlanUpdatePayload).toBeNull()
  })

  it('500 si la lectura de treatments falla', async () => {
    configureFrom({ treatmentReadError: { message: 'boom' } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(500)
  })

  it('409 si el tratamiento no tiene plan registrado (Given del epic)', async () => {
    configureFrom({ planSelectData: null })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/registrá el plan/i)
    expect(lastPlanUpdatePayload).toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('500 si la lectura de treatment_plans falla (p.ej. 040 sin aplicar)', async () => {
    configureFrom({ planSelectError: { message: 'relation does not exist' } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(500)
  })

  it('409 si YA está dado de alta (discharge_at != null AND status completed)', async () => {
    configureFrom({
      treatmentRow: { treatment_id: TREATMENT_ID, status: 'completed' },
      planSelectData: { plan_id: PLAN_ID, discharge_at: '2026-06-01T00:00:00Z' },
    })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/ya fue dado de alta/i)
    expect(lastPlanUpdatePayload).toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('re-POST reparador: discharge_at != null pero status active → 200 (repara el estado parcial)', async () => {
    configureFrom({
      treatmentRow: { treatment_id: TREATMENT_ID, status: 'active' },
      planSelectData: { plan_id: PLAN_ID, discharge_at: '2026-06-01T00:00:00Z' },
    })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(200)
    expect(lastPlanUpdatePayload).not.toBeNull()
    expect(lastTreatmentUpdatePayload).toEqual({ status: 'completed' })
  })

  it('alta permitida desde status expired (decisión clínica) → 200 y termina completed', async () => {
    configureFrom({ treatmentRow: { treatment_id: TREATMENT_ID, status: 'expired' } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(200)
    expect(lastTreatmentUpdatePayload).toEqual({ status: 'completed' })
  })
})

describe('POST /api/treatments/[id]/discharge — secuencia de escritura', () => {
  it('200: sella el plan (discharge_at ISO del server, report trimmeado, author_id) y pasa status a completed', async () => {
    const before = Date.now()
    const res = await POST(makeRequest({ discharge_report: '  Paciente recuperado.  ' }), context)
    const after = Date.now()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.plan_id).toBe(PLAN_ID)

    // Paso 1 — plan: payload exacto
    expect(lastPlanUpdatePayload).toBeDefined()
    expect(Object.keys(lastPlanUpdatePayload!).sort()).toEqual([
      'author_id',
      'discharge_at',
      'discharge_report',
    ])
    expect(lastPlanUpdatePayload!.discharge_report).toBe('Paciente recuperado.')
    expect(lastPlanUpdatePayload!.author_id).toBe('user-1')
    // discharge_at = server time (ISO) dentro de la ventana del test — anti-backdating
    const dischargeAt = new Date(lastPlanUpdatePayload!.discharge_at as string).getTime()
    expect(dischargeAt).toBeGreaterThanOrEqual(before)
    expect(dischargeAt).toBeLessThanOrEqual(after)
    // update por plan_id (no por treatment_id)
    expect(lastPlanUpdateEqArgs).toEqual(['plan_id', PLAN_ID])
    // NO toca los 4 campos del plan ni updated_at (trigger de DB)
    expect(lastPlanUpdatePayload).not.toHaveProperty('motivo_consulta')
    expect(lastPlanUpdatePayload).not.toHaveProperty('objetivo')
    expect(lastPlanUpdatePayload).not.toHaveProperty('cie10_code')
    expect(lastPlanUpdatePayload).not.toHaveProperty('indicated_sessions')
    expect(lastPlanUpdatePayload).not.toHaveProperty('updated_at')
    expect(lastPlanUpdatePayload).not.toHaveProperty('tenant_id')

    // Paso 2 — treatments: status completed con count exact
    expect(lastTreatmentUpdatePayload).toEqual({ status: 'completed' })
    expect(lastTreatmentUpdateOptions).toEqual({ count: 'exact' })
  })

  it('500 si falla el paso 1 (plan): nada se escribió en treatments y NO hay audit', async () => {
    configureFrom({ planUpdateData: null, planUpdateError: { message: 'update fail' } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/informe final/i)
    expect(lastTreatmentUpdatePayload).toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('500 PARCIAL si falla el paso 2 (status): mensaje explícito de reintento y NO hay audit', async () => {
    configureFrom({ treatmentUpdateError: { message: 'status fail' } })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/se guardó pero no se pudo marcar.*reintentá el alta/i)
    // el plan SÍ se escribió (estado parcial reparable por re-POST)
    expect(lastPlanUpdatePayload).not.toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('500 PARCIAL si el paso 2 no afecta filas (count 0): mismo mensaje, sin audit', async () => {
    configureFrom({ treatmentUpdateCount: 0 })
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/reintentá el alta/i)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('POST /api/treatments/[id]/discharge — audit trail', () => {
  it('llama logAudit con treatment_discharged SOLO tras éxito total', async () => {
    const res = await POST(makeRequest(validBody), context)
    expect(res.status).toBe(200)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_discharged',
        entity_type: 'treatment',
        entity_id: TREATMENT_ID,
      }),
    )
  })

  it('NO llama logAudit en 4xx (403 / 404 / 409)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    await POST(makeRequest(validBody), context)

    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
    configureFrom({ treatmentRow: null })
    await POST(makeRequest(validBody), context)

    configureFrom({ planSelectData: null })
    await POST(makeRequest(validBody), context)

    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

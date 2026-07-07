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

import { GET, PUT } from './route'

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
    discharge_at: null,
    discharge_report: null,
    author_id: 'user-1',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

// Builder de treatments: .select().eq().maybeSingle() → { data, error }
function makeTreatmentsBuilder(
  data: { treatment_id: string; patient_id?: string } | null,
  error: unknown = null,
) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
  }
  return builder
}

// Builder de treatment_plans: soporta .select().eq().maybeSingle() (GET)
// y .upsert().select().single() (PUT), capturando payload + opciones.
let lastUpsertPayload: Record<string, unknown> | null = null
let lastUpsertOptions: Record<string, unknown> | null = null
function makePlansBuilder(cfg: {
  selectData?: Record<string, unknown> | null
  selectError?: unknown
  upsertData?: Record<string, unknown> | null
  upsertError?: unknown
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: cfg.selectData ?? null, error: cfg.selectError ?? null }),
    ),
    upsert: vi.fn((payload: Record<string, unknown>, options: Record<string, unknown>) => {
      lastUpsertPayload = payload
      lastUpsertOptions = options
      return builder
    }),
    single: vi.fn(() =>
      Promise.resolve({
        data: cfg.upsertData === undefined ? makePlanRow() : cfg.upsertData,
        error: cfg.upsertError ?? null,
      }),
    ),
  }
  return builder
}

interface FromConfig {
  treatmentRow?: { treatment_id: string; patient_id?: string } | null
  treatmentError?: unknown
  planSelectData?: Record<string, unknown> | null
  planSelectError?: unknown
  planUpsertData?: Record<string, unknown> | null
  planUpsertError?: unknown
}

function configureFrom(cfg: FromConfig = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'treatments')
      return makeTreatmentsBuilder(
        cfg.treatmentRow === undefined
          ? { treatment_id: TREATMENT_ID, patient_id: PATIENT_ID }
          : cfg.treatmentRow,
        cfg.treatmentError ?? null,
      )
    if (table === 'treatment_plans')
      return makePlansBuilder({
        selectData: cfg.planSelectData,
        selectError: cfg.planSelectError,
        upsertData: cfg.planUpsertData,
        upsertError: cfg.planUpsertError,
      })
    throw new Error(`unexpected table ${table}`)
  })
}

const context = { params: Promise.resolve({ id: TREATMENT_ID }) }

function makeGetRequest() {
  return new Request(`http://localhost/api/treatments/${TREATMENT_ID}/plan`)
}

function makePutRequest(body: unknown) {
  return new Request(`http://localhost/api/treatments/${TREATMENT_ID}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    motivo_consulta: 'Lumbalgia',
    objetivo: 'Reducir dolor',
    cie10_code: 'm54.5',
    indicated_sessions: 10,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  lastUpsertPayload = null
  lastUpsertOptions = null
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
  mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
  mockLogAudit.mockResolvedValue(undefined)
  configureFrom()
})

describe('GET /api/treatments/[id]/plan', () => {
  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(401)
  })

  it('401 si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(401)
  })

  it('403 si el rol no es admin/doctor/receptionist (HCE — Ley 25.326)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'otro', tenant_id: 'tenant-1' })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('permite rol admin', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    configureFrom({ planSelectData: makePlanRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
  })

  it('permite rol receptionist (ISADI: recepción carga el plan de tratamiento)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    configureFrom({ planSelectData: makePlanRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
  })

  it('404 si el treatment no existe (o es de otro tenant — RLS lo oculta)', async () => {
    configureFrom({ treatmentRow: null })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(404)
  })

  it('500 si la query de treatments falla', async () => {
    configureFrom({ treatmentError: { message: 'boom' } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(500)
  })

  it('200 con el plan cuando existe', async () => {
    configureFrom({ planSelectData: makePlanRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.plan_id).toBe(PLAN_ID)
    expect(body.plan.cie10_code).toBe('M54.5')
  })

  it('200 con plan: null cuando el tratamiento aún no tiene plan', async () => {
    configureFrom({ planSelectData: null })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan).toBeNull()
  })

  it('500 si la query de treatment_plans falla (p.ej. tabla sin migrar)', async () => {
    configureFrom({ planSelectError: { message: 'relation does not exist' } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/treatments/[id]/plan', () => {
  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(401)
  })

  it('403 si el rol no es admin/doctor/receptionist', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'otro', tenant_id: 'tenant-1' })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(403)
    expect(lastUpsertPayload).toBeNull()
  })

  it('permite rol receptionist (ISADI: recepción carga el plan de tratamiento)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(200)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(400)
  })

  it('400 si el body no es JSON', async () => {
    const req = new Request(`http://localhost/api/treatments/${TREATMENT_ID}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    })
    const res = await PUT(req, context)
    expect(res.status).toBe(400)
  })

  it('400 si el CIE-10 está malformado', async () => {
    const res = await PUT(makePutRequest(validBody({ cie10_code: 'XX99' })), context)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Datos inválidos')
    expect(body.details).toBeDefined()
  })

  it('400 si viene discharge_at (scope 14.6 — strictObject)', async () => {
    const res = await PUT(
      makePutRequest(validBody({ discharge_at: '2026-06-10T00:00:00Z' })),
      context,
    )
    expect(res.status).toBe(400)
    expect(lastUpsertPayload).toBeNull()
  })

  it('400 si viene discharge_report (scope 14.6 — strictObject)', async () => {
    const res = await PUT(makePutRequest(validBody({ discharge_report: 'alta' })), context)
    expect(res.status).toBe(400)
  })

  it('400 si indicated_sessions es 0', async () => {
    const res = await PUT(makePutRequest(validBody({ indicated_sessions: 0 })), context)
    expect(res.status).toBe(400)
  })

  it('404 si el treatment no existe', async () => {
    configureFrom({ treatmentRow: null })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(404)
    expect(lastUpsertPayload).toBeNull()
  })

  it('500 si el upsert falla', async () => {
    configureFrom({ planUpsertData: null, planUpsertError: { message: 'upsert fail' } })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(500)
  })

  it('200 + upsert con tenant del JWT, patient de la fila treatments, author_id y onConflict treatment_id', async () => {
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.plan_id).toBe(PLAN_ID)

    expect(lastUpsertPayload).toEqual({
      tenant_id: 'tenant-1',
      treatment_id: TREATMENT_ID,
      patient_id: PATIENT_ID,
      motivo_consulta: 'Lumbalgia',
      objetivo: 'Reducir dolor',
      cie10_code: 'M54.5', // normalizado a MAYÚSCULAS por el schema
      indicated_sessions: 10,
      author_id: 'user-1',
    })
    expect(lastUpsertOptions).toEqual({ onConflict: 'treatment_id' })
    // NO escribe discharge_* ni updated_at (trigger de DB)
    expect(lastUpsertPayload).not.toHaveProperty('discharge_at')
    expect(lastUpsertPayload).not.toHaveProperty('discharge_report')
    expect(lastUpsertPayload).not.toHaveProperty('updated_at')
  })

  it('tenant_id y patient_id NUNCA del body: el strictObject los rechaza', async () => {
    const res = await PUT(
      makePutRequest(validBody({ tenant_id: 'evil-tenant', patient_id: 'evil-patient' })),
      context,
    )
    expect(res.status).toBe(400)
    expect(lastUpsertPayload).toBeNull()
  })

  it('body vacío {} es válido: upsert con los 4 campos en null', async () => {
    const res = await PUT(makePutRequest({}), context)
    expect(res.status).toBe(200)
    expect(lastUpsertPayload).toMatchObject({
      motivo_consulta: null,
      objetivo: null,
      cie10_code: null,
      indicated_sessions: null,
    })
  })

  it('llama logAudit con treatment_plan_updated / treatment / treatment_id tras el upsert', async () => {
    await PUT(makePutRequest(validBody()), context)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_plan_updated',
        entity_type: 'treatment',
        entity_id: TREATMENT_ID,
      }),
    )
  })

  it('NO llama logAudit si el upsert falla', async () => {
    configureFrom({ planUpsertData: null, planUpsertError: { message: 'upsert fail' } })
    await PUT(makePutRequest(validBody()), context)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  // ── Hardening Story 14.6: plan de SOLO LECTURA tras el alta ─────────────────
  describe('post-alta (Story 14.6 — read-only server-side)', () => {
    it('409 si el plan ya tiene discharge_at (tratamiento dado de alta), sin upsert ni audit', async () => {
      configureFrom({
        planSelectData: makePlanRow({
          discharge_at: '2026-06-11T12:00:00Z',
          discharge_report: 'Alta médica.',
        }),
      })
      const res = await PUT(makePutRequest(validBody()), context)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/dado de alta.*solo lectura/i)
      expect(lastUpsertPayload).toBeNull()
      expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('200 si el plan existe SIN alta (discharge_at null) — regresión', async () => {
      configureFrom({ planSelectData: makePlanRow({ discharge_at: null }) })
      const res = await PUT(makePutRequest(validBody()), context)
      expect(res.status).toBe(200)
      expect(lastUpsertPayload).not.toBeNull()
    })

    it('200 si NO hay plan todavía (maybeSingle null) — sigue al upsert de creación', async () => {
      configureFrom({ planSelectData: null })
      const res = await PUT(makePutRequest(validBody()), context)
      expect(res.status).toBe(200)
      expect(lastUpsertPayload).not.toBeNull()
    })

    it('500 si la pre-lectura del plan falla', async () => {
      configureFrom({ planSelectError: { message: 'boom' } })
      const res = await PUT(makePutRequest(validBody()), context)
      expect(res.status).toBe(500)
      expect(lastUpsertPayload).toBeNull()
    })
  })
})

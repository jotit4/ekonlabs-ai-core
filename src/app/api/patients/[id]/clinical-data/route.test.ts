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

const PATIENT_ID = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const CLINICAL_SELECT = 'patient_id, antecedentes, alergias, medicacion'

function makeClinicalRow(overrides: Record<string, unknown> = {}) {
  return {
    patient_id: PATIENT_ID,
    antecedentes: 'HTA',
    alergias: 'Penicilina',
    medicacion: 'Enalapril 10mg',
    ...overrides,
  }
}

// Capturas del builder de patients
let selectArgs: string[] = []
let lastUpdatePayload: Record<string, unknown> | null = null
let lastUpdateSelectArg: string | null = null

// Builder de patients: soporta .select(cols).eq().maybeSingle() (existencia/GET)
// y .update(payload).eq().select(cols).single() (PUT), capturando args.
function makePatientsBuilder(cfg: {
  selectData?: Record<string, unknown> | null
  selectError?: unknown
  updateData?: Record<string, unknown> | null
  updateError?: unknown
}) {
  const updateChain = {
    eq: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        lastUpdateSelectArg = cols
        return {
          single: vi.fn(() =>
            Promise.resolve({
              data: cfg.updateData === undefined ? makeClinicalRow() : cfg.updateData,
              error: cfg.updateError ?? null,
            }),
          ),
        }
      }),
    })),
  }

  return {
    select: vi.fn((cols: string) => {
      selectArgs.push(cols)
      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: cfg.selectData === undefined ? makeClinicalRow() : cfg.selectData,
              error: cfg.selectError ?? null,
            }),
          ),
        })),
      }
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      lastUpdatePayload = payload
      return updateChain
    }),
  }
}

interface FromConfig {
  selectData?: Record<string, unknown> | null
  selectError?: unknown
  updateData?: Record<string, unknown> | null
  updateError?: unknown
}

function configureFrom(cfg: FromConfig = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'patients') return makePatientsBuilder(cfg)
    throw new Error(`unexpected table ${table}`)
  })
}

function makeContext(id: string = PATIENT_ID) {
  return { params: Promise.resolve({ id }) }
}

function makeGetRequest() {
  return new Request(`http://localhost/api/patients/${PATIENT_ID}/clinical-data`)
}

function makePutRequest(body: unknown) {
  return new Request(`http://localhost/api/patients/${PATIENT_ID}/clinical-data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  selectArgs = []
  lastUpdatePayload = null
  lastUpdateSelectArg = null
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
  mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
  mockLogAudit.mockResolvedValue(undefined)
  configureFrom()
})

describe('GET /api/patients/[id]/clinical-data', () => {
  it('400 si el id no es un UUID (sin tocar la DB)', async () => {
    const res = await GET(makeGetRequest(), makeContext('no-es-uuid'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('401 si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('403 si el rol es receptionist (HCE — Ley 25.326) SIN tocar la DB', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('permite rol admin', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(200)
  })

  it('404 si el paciente no existe (o es de otro tenant — RLS lo oculta)', async () => {
    configureFrom({ selectData: null })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(404)
  })

  it('500 si la query falla (p.ej. migración 042 sin aplicar en prod)', async () => {
    configureFrom({ selectError: { message: 'column patients.antecedentes does not exist' } })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(500)
  })

  it('200 con clinical_data y select EXPLÍCITO solo de los 3 campos + patient_id (nunca *)', async () => {
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clinical_data).toEqual({
      antecedentes: 'HTA',
      alergias: 'Penicilina',
      medicacion: 'Enalapril 10mg',
    })
    expect(selectArgs).toEqual([CLINICAL_SELECT])
    // La respuesta NO arrastra patient_id ni campos administrativos
    expect(body.clinical_data).not.toHaveProperty('patient_id')
    expect(body.clinical_data).not.toHaveProperty('full_name')
  })

  it('200 con los 3 campos en null cuando aún no se cargaron', async () => {
    configureFrom({
      selectData: makeClinicalRow({ antecedentes: null, alergias: null, medicacion: null }),
    })
    const res = await GET(makeGetRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clinical_data).toEqual({ antecedentes: null, alergias: null, medicacion: null })
  })
})

describe('PUT /api/patients/[id]/clinical-data', () => {
  it('400 si el id no es un UUID (sin tocar la DB)', async () => {
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext('123'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(401)
  })

  it('403 si el rol es receptionist SIN tocar la DB ni el UPDATE', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(lastUpdatePayload).toBeNull()
  })

  it('permite rol admin', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(200)
  })

  it('400 si el body no es JSON', async () => {
    const req = new Request(`http://localhost/api/patients/${PATIENT_ID}/clinical-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    })
    const res = await PUT(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('400 con details si falla el schema (clave extra patient_id — strictObject)', async () => {
    const res = await PUT(
      makePutRequest({ alergias: 'Polen', patient_id: 'evil-patient' }),
      makeContext(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Datos inválidos')
    expect(body.details).toBeDefined()
    expect(lastUpdatePayload).toBeNull()
  })

  it('400 si vienen tenant_id/notes/full_name en el body (strictObject)', async () => {
    for (const extra of [{ tenant_id: 'evil' }, { notes: 'admin' }, { full_name: 'X' }]) {
      const res = await PUT(makePutRequest({ ...extra }), makeContext())
      expect(res.status).toBe(400)
    }
    expect(lastUpdatePayload).toBeNull()
  })

  it('404 si el paciente no existe', async () => {
    configureFrom({ selectData: null })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(404)
    expect(lastUpdatePayload).toBeNull()
  })

  it('500 si la verificación de existencia falla', async () => {
    configureFrom({ selectError: { message: 'boom' } })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(500)
    expect(lastUpdatePayload).toBeNull()
  })

  it('200 + UPDATE con los 3 campos normalizados + updated_at manual, SIN tenant/notes/full_name', async () => {
    const res = await PUT(
      makePutRequest({
        antecedentes: '  HTA  ',
        alergias: '',
        medicacion: 'Enalapril 10mg',
      }),
      makeContext(),
    )
    expect(res.status).toBe(200)

    expect(lastUpdatePayload).toEqual({
      antecedentes: 'HTA', // trim del schema
      alergias: null, // vacío → null
      medicacion: 'Enalapril 10mg',
      updated_at: expect.any(String),
    })
    // patients NO tiene trigger de updated_at → se setea manualmente (ISO válido)
    expect(new Date(lastUpdatePayload!.updated_at as string).toString()).not.toBe('Invalid Date')
    // JAMÁS campos administrativos ni ids en el UPDATE
    expect(lastUpdatePayload).not.toHaveProperty('tenant_id')
    expect(lastUpdatePayload).not.toHaveProperty('patient_id')
    expect(lastUpdatePayload).not.toHaveProperty('notes')
    expect(lastUpdatePayload).not.toHaveProperty('full_name')
    // Select de retorno EXPLÍCITO (nunca .select() pelado)
    expect(lastUpdateSelectArg).toBe(CLINICAL_SELECT)

    const body = await res.json()
    expect(body.clinical_data).toEqual({
      antecedentes: 'HTA',
      alergias: 'Penicilina',
      medicacion: 'Enalapril 10mg',
    })
  })

  it('UPDATE PARCIAL: solo alergias en el body → el payload NO toca antecedentes ni medicacion', async () => {
    const res = await PUT(makePutRequest({ alergias: 'Ibuprofeno' }), makeContext())
    expect(res.status).toBe(200)
    expect(lastUpdatePayload).toEqual({
      alergias: 'Ibuprofeno',
      updated_at: expect.any(String),
    })
    expect(lastUpdatePayload).not.toHaveProperty('antecedentes')
    expect(lastUpdatePayload).not.toHaveProperty('medicacion')
  })

  it('clave presente con null → setea null (distinto de clave ausente)', async () => {
    await PUT(makePutRequest({ medicacion: null }), makeContext())
    expect(lastUpdatePayload).toEqual({
      medicacion: null,
      updated_at: expect.any(String),
    })
  })

  it('body vacío {} es válido → UPDATE solo con updated_at (no toca ningún campo clínico)', async () => {
    const res = await PUT(makePutRequest({}), makeContext())
    expect(res.status).toBe(200)
    expect(lastUpdatePayload).toEqual({ updated_at: expect.any(String) })
  })

  it('500 si el UPDATE falla (p.ej. migración 042 sin aplicar) y NO audita', async () => {
    configureFrom({ updateData: null, updateError: { message: 'column does not exist' } })
    const res = await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(res.status).toBe(500)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('llama logAudit con patient_clinical_data_updated / patient / id tras el UPDATE exitoso', async () => {
    await PUT(makePutRequest({ alergias: 'Polen' }), makeContext())
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'patient_clinical_data_updated',
        entity_type: 'patient',
        entity_id: PATIENT_ID,
      }),
    )
  })
})

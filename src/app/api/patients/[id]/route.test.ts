import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
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

import { PATCH } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-uuid-1234', app_role: 'receptionist' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const PATIENT_ID = 'patient-test-uuid-1234'
const VALID_BODY = {
  full_name: 'María García Editada',
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
}

function makeRequest(body: unknown = VALID_BODY) {
  return new Request(`http://localhost/api/patients/${PATIENT_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id: string = PATIENT_ID) {
  return { params: Promise.resolve({ id }) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/patients/[id]', () => {
  const mockExistingPatient = { patient_id: PATIENT_ID, dni: null }
  const mockUpdatedPatient = { patient_id: PATIENT_ID, full_name: 'María García Editada', phone_number: '1133334444', dni: null }

  beforeEach(() => {
    vi.clearAllMocks()

    const token = makeJwt()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } })

    // Default: patient exists for SELECT verification
    // Default: update succeeds
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockExistingPatient, error: null })
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedPatient, error: null })

    // SELECT chain supports both single-eq (patient existence) and double-eq (DNI check):
    //   .select().eq('patient_id', id).maybeSingle()
    //   .select().eq('tenant_id', tenantId).eq('dni', body.dni).maybeSingle()
    const mockSelectEqInner = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelectChain = {
      eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle, eq: mockSelectEqInner })),
    }
    const mockUpdateChain = {
      eq: vi.fn(() => ({
        select: vi.fn(() => ({ single: mockSingle })),
      })),
    }

    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(() => mockUpdateChain),
    })
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('retorna 404 si el paciente no existe', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockSelectEqInner = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelectChain = { eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle, eq: mockSelectEqInner })) }
    const mockUpdateChain = { eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn() })) })) }

    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(() => mockUpdateChain),
    })

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(404)
  })

  it('retorna 200 + paciente actualizado en PATCH válido', async () => {
    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.patient).toBeDefined()
    expect(body.patient.patient_id).toBe(PATIENT_ID)
  })

  it('retorna 409 si el DNI ya existe en otro paciente', async () => {
    // Primer SELECT → paciente existente con DNI diferente
    // Segundo SELECT (DNI check) → otro paciente con ese DNI
    const existingPatient = { patient_id: PATIENT_ID, dni: '11111111' }
    const dniConflictPatient = { patient_id: 'other-patient-id' }

    // First SELECT: .select().eq('patient_id', id).maybeSingle() → returns existingPatient
    // Second SELECT (DNI check): .select().eq('tenant_id', ...).eq('dni', ...).maybeSingle() → returns dniConflictPatient
    const mockMaybeSingleExistence = vi.fn().mockResolvedValue({ data: existingPatient, error: null })
    const mockMaybeSingleDni = vi.fn().mockResolvedValue({ data: dniConflictPatient, error: null })

    // Inner eq (second .eq call in DNI check chain)
    const mockSelectEqInner = vi.fn(() => ({ maybeSingle: mockMaybeSingleDni }))
    // Outer eq: for patient existence it returns { maybeSingle }, for DNI check it returns { eq, maybeSingle }
    const mockSelectEqOuter = vi.fn(() => ({
      maybeSingle: mockMaybeSingleExistence,
      eq: mockSelectEqInner,
    }))

    const mockSelectChain = { eq: mockSelectEqOuter }
    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(),
    })

    const bodyWithDni = { ...VALID_BODY, dni: '30123456' } // DNI nuevo, diferente al actual
    const res = await PATCH(makeRequest(bodyWithDni), makeContext())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('DNI')
  })

  // ─── Regresión Story 14.4 (AC 6) — blindaje del write path genérico ─────────
  // PatientApiSchema es z.object NO estricto → Zod v4 STRIPEA claves desconocidas.
  // Este test FIJA ese contrato: los campos clínicos (antecedentes/alergias/
  // medicacion, HCE — migración 042) inyectados en el body del PATCH genérico
  // NUNCA llegan al UPDATE. Solo se escriben por PUT /api/patients/[id]/clinical-data
  // (guard doctor/admin). Si alguien convierte PatientApiSchema a strictObject o
  // agrega los campos al schema, este test lo detecta.
  it('PATCH con antecedentes/alergias/medicacion extra → 200 y el payload del UPDATE NO los contiene (Zod strip)', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null

    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockExistingPatient, error: null })
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedPatient, error: null })
    const mockSelectChain = { eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) }
    const mockUpdate = vi.fn((payload: Record<string, unknown>) => {
      capturedUpdatePayload = payload
      return {
        eq: vi.fn(() => ({
          select: vi.fn(() => ({ single: mockSingle })),
        })),
      }
    })

    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: mockUpdate,
    })

    const bodyWithClinicalFields = {
      ...VALID_BODY,
      antecedentes: 'HTA inyectada por receptionist',
      alergias: 'Penicilina inyectada',
      medicacion: 'Enalapril inyectado',
    }
    const res = await PATCH(makeRequest(bodyWithClinicalFields), makeContext())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(capturedUpdatePayload).not.toBeNull()
    expect(capturedUpdatePayload).not.toHaveProperty('antecedentes')
    expect(capturedUpdatePayload).not.toHaveProperty('alergias')
    expect(capturedUpdatePayload).not.toHaveProperty('medicacion')
    // Los campos administrativos legítimos SÍ pasan
    expect(capturedUpdatePayload).toHaveProperty('full_name', 'María García Editada')
  })

  // Sellado Story 14.4 (AC 5): la respuesta { patient } del PATCH genérico sale de un
  // select EXPLÍCITO de columnas administrativas — nunca .select() pelado (que tras la
  // migración 042 devolvería antecedentes/alergias/medicacion a sesiones receptionist).
  it('el UPDATE usa select explícito de columnas administrativas (sin campos clínicos)', async () => {
    let capturedSelectArg: string | undefined

    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockExistingPatient, error: null })
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedPatient, error: null })
    const mockSelectChain = { eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) }

    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn((cols?: string) => {
            capturedSelectArg = cols
            return { single: mockSingle }
          }),
        })),
      })),
    })

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    expect(capturedSelectArg).toBeDefined()
    expect(capturedSelectArg).toContain('patient_id')
    expect(capturedSelectArg).not.toContain('antecedentes')
    expect(capturedSelectArg).not.toContain('alergias')
    expect(capturedSelectArg).not.toContain('medicacion')
    expect(capturedSelectArg).not.toContain('*')
  })
})

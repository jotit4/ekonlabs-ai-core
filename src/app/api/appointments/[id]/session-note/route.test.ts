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

const APPOINTMENT_ID = 'a3f1c2d4-949b-4dff-9aca-c86031a5f4a5'
const PATIENT_ID = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const PACKAGE_ID = 'b98932dc-67e8-4e3d-9a51-0a40c7a4f222'
const NOTE_ID = '7c1f2f59-67e8-4e3d-9a51-0a40c7a4f111'

function makeNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    session_note_id: NOTE_ID,
    tenant_id: 'tenant-1',
    appointment_id: APPOINTMENT_ID,
    treatment_id: PACKAGE_ID,
    patient_id: PATIENT_ID,
    worked_on: 'Movilidad de hombro',
    progress: 'Mejora el rango articular',
    author_id: 'user-1',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

interface AppointmentRow {
  appointment_id: string
  patient_id?: string | null
  package_id?: string | null
}

// Builder de appointments: .select().eq().maybeSingle() → { data, error }
function makeAppointmentsBuilder(data: AppointmentRow | null, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
  }
  return builder
}

// Builder de session_notes: soporta .select().eq().maybeSingle() (GET)
// y .upsert().select().single() (PUT), capturando payload + opciones.
let lastUpsertPayload: Record<string, unknown> | null = null
let lastUpsertOptions: Record<string, unknown> | null = null
function makeNotesBuilder(cfg: {
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
        data: cfg.upsertData === undefined ? makeNoteRow() : cfg.upsertData,
        error: cfg.upsertError ?? null,
      }),
    ),
  }
  return builder
}

interface FromConfig {
  appointmentRow?: AppointmentRow | null
  appointmentError?: unknown
  noteSelectData?: Record<string, unknown> | null
  noteSelectError?: unknown
  noteUpsertData?: Record<string, unknown> | null
  noteUpsertError?: unknown
}

function configureFrom(cfg: FromConfig = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'appointments')
      return makeAppointmentsBuilder(
        cfg.appointmentRow === undefined
          ? { appointment_id: APPOINTMENT_ID, patient_id: PATIENT_ID, package_id: PACKAGE_ID }
          : cfg.appointmentRow,
        cfg.appointmentError ?? null,
      )
    if (table === 'session_notes')
      return makeNotesBuilder({
        selectData: cfg.noteSelectData,
        selectError: cfg.noteSelectError,
        upsertData: cfg.noteUpsertData,
        upsertError: cfg.noteUpsertError,
      })
    throw new Error(`unexpected table ${table}`)
  })
}

const context = { params: Promise.resolve({ id: APPOINTMENT_ID }) }
const badContext = { params: Promise.resolve({ id: 'no-es-uuid' }) }

function makeGetRequest() {
  return new Request(`http://localhost/api/appointments/${APPOINTMENT_ID}/session-note`)
}

function makePutRequest(body: unknown) {
  return new Request(`http://localhost/api/appointments/${APPOINTMENT_ID}/session-note`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    worked_on: 'Movilidad de hombro',
    progress: 'Mejora el rango articular',
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

describe('GET /api/appointments/[id]/session-note', () => {
  it('400 si el id no es UUID (B-11), sin tocar la DB', async () => {
    const res = await GET(makeGetRequest(), badContext)
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

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

  it('403 si el rol no es admin/doctor/receptionist (HCE — Ley 25.326), sin queries', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'otro', tenant_id: 'tenant-1' })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('permite rol admin', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    configureFrom({ noteSelectData: makeNoteRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
  })

  it('permite rol receptionist (ISADI: recepción carga la evolución por sesión)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    configureFrom({ noteSelectData: makeNoteRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
  })

  it('404 si el turno no existe (o es de otro tenant — RLS lo oculta)', async () => {
    configureFrom({ appointmentRow: null })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(404)
  })

  it('500 si la query de appointments falla', async () => {
    configureFrom({ appointmentError: { message: 'boom' } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(500)
  })

  it('200 con la evolución cuando existe', async () => {
    configureFrom({ noteSelectData: makeNoteRow() })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note.session_note_id).toBe(NOTE_ID)
    expect(body.note.worked_on).toBe('Movilidad de hombro')
  })

  it('200 con note: null cuando el turno aún no tiene evolución', async () => {
    configureFrom({ noteSelectData: null })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note).toBeNull()
  })

  it('500 si la query de session_notes falla (p.ej. migración 041 sin aplicar)', async () => {
    configureFrom({ noteSelectError: { message: 'relation does not exist' } })
    const res = await GET(makeGetRequest(), context)
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/appointments/[id]/session-note', () => {
  it('400 si el id no es UUID (B-11), sin tocar la DB', async () => {
    const res = await PUT(makePutRequest(validBody()), badContext)
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(401)
  })

  it('403 si el rol no es admin/doctor/receptionist, sin upsert', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'otro', tenant_id: 'tenant-1' })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(lastUpsertPayload).toBeNull()
  })

  it('permite rol receptionist (ISADI: recepción carga la evolución por sesión)', async () => {
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
    const req = new Request(`http://localhost/api/appointments/${APPOINTMENT_ID}/session-note`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    })
    const res = await PUT(req, context)
    expect(res.status).toBe(400)
  })

  it('400 si viene treatment_id en el body (strictObject — se deriva en el server)', async () => {
    const res = await PUT(makePutRequest(validBody({ treatment_id: 'evil-trt' })), context)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Datos inválidos')
    expect(body.details).toBeDefined()
    expect(lastUpsertPayload).toBeNull()
  })

  it('appointment_id / tenant_id / patient_id / author_id NUNCA del body: strictObject los rechaza', async () => {
    for (const key of ['appointment_id', 'tenant_id', 'patient_id', 'author_id']) {
      const res = await PUT(makePutRequest(validBody({ [key]: 'evil' })), context)
      expect(res.status).toBe(400)
    }
    expect(lastUpsertPayload).toBeNull()
  })

  it('404 si el turno no existe', async () => {
    configureFrom({ appointmentRow: null })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(404)
    expect(lastUpsertPayload).toBeNull()
  })

  it('422 si el turno no tiene paciente asociado — sin upsert y sin audit', async () => {
    configureFrom({
      appointmentRow: { appointment_id: APPOINTMENT_ID, patient_id: null, package_id: null },
    })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/no tiene un paciente asociado/i)
    expect(lastUpsertPayload).toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('500 si la query de appointments falla, sin upsert ni audit', async () => {
    configureFrom({ appointmentError: { message: 'boom' } })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(500)
    expect(lastUpsertPayload).toBeNull()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('500 si el upsert falla (p.ej. migración 041 sin aplicar)', async () => {
    configureFrom({ noteUpsertData: null, noteUpsertError: { message: 'upsert fail' } })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(500)
  })

  it('200 + upsert con tenant del JWT, patient y treatment de la fila appointments, author_id y onConflict appointment_id', async () => {
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note.session_note_id).toBe(NOTE_ID)

    expect(lastUpsertPayload).toEqual({
      tenant_id: 'tenant-1',
      appointment_id: APPOINTMENT_ID,
      treatment_id: PACKAGE_ID, // = appointments.package_id, NUNCA del body
      patient_id: PATIENT_ID, // = appointments.patient_id, NUNCA del body
      worked_on: 'Movilidad de hombro',
      progress: 'Mejora el rango articular',
      author_id: 'user-1',
    })
    expect(lastUpsertOptions).toEqual({ onConflict: 'appointment_id' })
    // NO escribe updated_at (trigger de DB)
    expect(lastUpsertPayload).not.toHaveProperty('updated_at')
  })

  it('turno suelto (sin package_id) → upsert con treatment_id: null (AC del epic)', async () => {
    configureFrom({
      appointmentRow: { appointment_id: APPOINTMENT_ID, patient_id: PATIENT_ID, package_id: null },
      noteUpsertData: makeNoteRow({ treatment_id: null }),
    })
    const res = await PUT(makePutRequest(validBody()), context)
    expect(res.status).toBe(200)
    expect(lastUpsertPayload).toMatchObject({
      appointment_id: APPOINTMENT_ID,
      treatment_id: null,
      patient_id: PATIENT_ID,
    })
    const body = await res.json()
    expect(body.note.treatment_id).toBeNull()
  })

  it('body vacío {} es válido: upsert con worked_on/progress en null', async () => {
    const res = await PUT(makePutRequest({}), context)
    expect(res.status).toBe(200)
    expect(lastUpsertPayload).toMatchObject({ worked_on: null, progress: null })
  })

  it("strings vacíos → null (normalización del schema)", async () => {
    const res = await PUT(makePutRequest({ worked_on: '  ', progress: '' }), context)
    expect(res.status).toBe(200)
    expect(lastUpsertPayload).toMatchObject({ worked_on: null, progress: null })
  })

  it('llama logAudit con session_note_updated / appointment / appointment_id tras el upsert', async () => {
    await PUT(makePutRequest(validBody()), context)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session_note_updated',
        entity_type: 'appointment',
        entity_id: APPOINTMENT_ID,
      }),
    )
  })

  it('NO llama logAudit si el upsert falla', async () => {
    configureFrom({ noteUpsertData: null, noteUpsertError: { message: 'upsert fail' } })
    await PUT(makePutRequest(validBody()), context)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

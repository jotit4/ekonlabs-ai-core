import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { getFichaDossier } from './ficha-dossier'

// ── Helpers de mock ───────────────────────────────────────────────────────────
// Cliente Supabase falso: cada tabla resuelve su propia cadena de métodos.
// `patients` y `session_notes` terminan en maybeSingle()/la promesa del builder
// (postgrest-js hace await directo del builder), `treatments` termina en `.order()`.

interface FakeResult {
  data: unknown
  error: { code?: string; message: string } | null
}

function makeFrom(responses: Record<string, FakeResult | FakeResult[]>) {
  const calls: Record<string, number> = {}

  return vi.fn((table: string) => {
    const idx = calls[table] ?? 0
    calls[table] = idx + 1
    const configured = responses[table]
    const result = Array.isArray(configured) ? (configured[idx] ?? configured[configured.length - 1]) : configured

    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.in = vi.fn(() => Promise.resolve(result))
    chain.maybeSingle = vi.fn(() => Promise.resolve(result))
    chain.order = vi.fn(() => Promise.resolve(result))
    // Si nadie llama a un terminal explícito (patients_rls-like usage), el chain
    // en sí mismo puede ser awaited directamente por el código bajo test.
    chain.then = (resolve: (v: FakeResult) => void) => resolve(result)
    return chain
  })
}

function ok(data: unknown): FakeResult {
  return { data, error: null }
}

function fail(code: string, message = 'boom'): FakeResult {
  return { data: null, error: { code, message } }
}

const BASE_PATIENT = {
  patient_id: 'patient-1',
  full_name: 'Ana López',
  dni: '30123456',
  date_of_birth: '1990-05-15',
  phone_number: '+5491133334444',
  address: 'Calle Falsa 123',
  obra_social: 'OSDE',
  obra_social_number: '9999',
  reason_for_visit: 'Rehab rodilla',
  notes: 'Paciente puntual',
  antecedentes: 'Hipertensión',
  medicacion: 'Losartán',
  cirugias: 'Meniscectomía 2020',
  lugar: 'Mendoza',
  ocupacion: 'Docente',
  derivacion: 'Dr. Traumatólogo',
  actividad_fisica: 'Running',
  primary_professional_id: 'prof-1',
  professionals: { name: 'Dr. Juan Pérez' },
}

describe('getFichaDossier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateServiceRoleClient.mockReset()
  })

  it('devuelve null si el paciente no existe (o no es visible por RLS)', async () => {
    const from = makeFrom({
      patients: ok(null),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-x')
    expect(result).toBeNull()
  })

  it('arma el dossier completo con tratamientos y evolución', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: makeFrom({
        dashboard_users: ok([{ user_id: 'author-1', full_name: 'Lic. Carla Ruiz' }]),
      }),
    })

    const from = makeFrom({
      patients: ok(BASE_PATIENT),
      treatments: ok([
        {
          treatment_id: 'tr-1',
          service_id: 'svc-1',
          total_sessions: 2,
          status: 'active',
          created_at: '2026-06-01T00:00:00Z',
          services: { name: 'Kinesiología' },
          appointments: [
            { appointment_id: 'apt-1', session_index: 1, start_at: '2026-06-05T10:00:00Z', status: 'completed' },
          ],
          treatment_plans: { objetivo: 'Recuperar movilidad' },
        },
      ]),
      session_notes: ok([
        {
          session_note_id: 'note-1',
          worked_on: 'Movilización pasiva',
          progress: 'Buena tolerancia',
          author_id: 'author-1',
          appointments: { session_index: 1, start_at: '2026-06-05T10:00:00Z' },
        },
      ]),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-1')

    expect(result).not.toBeNull()
    expect(result?.patient.full_name).toBe('Ana López')
    expect(result?.patient.primary_professional_name).toBe('Dr. Juan Pérez')
    expect(result?.patient.antecedentes).toBe('Hipertensión')
    expect(result?.tratamientoObjetivo).toBe('Recuperar movilidad')
    expect(result?.treatments).toHaveLength(1)
    expect(result?.treatments[0].rows).toEqual([
      { session_index: 1, start_at: '2026-06-05T10:00:00Z', status: 'completed' },
      { session_index: 2, start_at: null, status: null },
    ])
    expect(result?.evolucion).toHaveLength(1)
    expect(result?.evolucion[0].author_name).toBe('Lic. Carla Ruiz')
    expect(result?.limitations).toEqual({
      clinicalFieldsUnavailable: false,
      treatmentPlansUnavailable: false,
      sessionNotesUnavailable: false,
    })
  })

  it('degrada antecedentes/medicacion si la migración 042 no está aplicada (columna inexistente)', async () => {
    const from = makeFrom({
      patients: [fail('42703', 'column patients.antecedentes does not exist'), ok(BASE_PATIENT)],
      treatments: ok([]),
      session_notes: ok([]),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-1')

    expect(result).not.toBeNull()
    expect(result?.limitations.clinicalFieldsUnavailable).toBe(true)
  })

  it('degrada treatment_plans si la tabla no existe (migración 040), sin romper el resto', async () => {
    const from = makeFrom({
      patients: ok(BASE_PATIENT),
      treatments: [
        fail('PGRST200', 'no relationship treatments-treatment_plans'),
        ok([
          {
            treatment_id: 'tr-1',
            service_id: 'svc-1',
            total_sessions: 1,
            status: 'active',
            created_at: '2026-06-01T00:00:00Z',
            services: { name: 'Kinesiología' },
            appointments: [],
          },
        ]),
      ],
      session_notes: ok([]),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-1')

    expect(result).not.toBeNull()
    expect(result?.limitations.treatmentPlansUnavailable).toBe(true)
    expect(result?.tratamientoObjetivo).toBeNull()
    expect(result?.treatments).toHaveLength(1)
  })

  it('degrada session_notes si la tabla no existe o RLS la filtra (migración 041 / receptionist)', async () => {
    const from = makeFrom({
      patients: ok(BASE_PATIENT),
      treatments: ok([]),
      session_notes: fail('42P01', 'relation "session_notes" does not exist'),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-1')

    expect(result).not.toBeNull()
    expect(result?.limitations.sessionNotesUnavailable).toBe(true)
    expect(result?.evolucion).toEqual([])
  })

  it('lanza si la query de patients falla por un motivo distinto a columna inexistente', async () => {
    const from = makeFrom({
      patients: fail('500', 'internal error'),
    })
    const supabase = { from } as never

    await expect(getFichaDossier(supabase, 'patient-1')).rejects.toThrow()
  })

  it('degrada nombres de autor a null si el service role no está configurado', async () => {
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('Missing Supabase service role environment variables')
    })

    const from = makeFrom({
      patients: ok(BASE_PATIENT),
      treatments: ok([]),
      session_notes: ok([
        {
          session_note_id: 'note-1',
          worked_on: 'Movilización pasiva',
          progress: null,
          author_id: 'author-1',
          appointments: { session_index: 1, start_at: '2026-06-05T10:00:00Z' },
        },
      ]),
    })
    const supabase = { from } as never

    const result = await getFichaDossier(supabase, 'patient-1')

    expect(result?.evolucion[0].author_name).toBeNull()
  })
})

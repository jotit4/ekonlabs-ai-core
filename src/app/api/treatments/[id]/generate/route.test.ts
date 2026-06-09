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

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}))

import { POST } from './route'

const PROF = '98c80b43-3f4a-4aa0-84ba-02be20fe6bcd'
const PATIENT = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const SERVICE = 'f38f1191-3e0d-4f60-bcd2-e647c2b899da'
const TREATMENT_ID = 'b98932dc-949b-4dff-9aca-c86031a5f4a5'

// ─── Configuración del mock de from() ────────────────────────────────────────
// treatments: .select().eq().maybeSingle()  → { data, error }   (carga)
// treatments: .update().eq()                 → { error }          (sessions_remaining)
// appointments: .update().eq()               → { error }          (package_id/session_index)
// appointments: .select(col,{count,head}).eq().in() → { count, error } (recount)

interface FromConfig {
  treatment?: Record<string, unknown> | null
  treatmentLoadError?: unknown
  packageCount?: number
  updatedApptIds?: string[] // captura los appointment_id que recibió el UPDATE de package_id
  trUpdates?: Record<string, unknown>[] // captura los updates a treatments
}

function configureFrom(cfg: FromConfig) {
  cfg.updatedApptIds = cfg.updatedApptIds ?? []
  cfg.trUpdates = cfg.trUpdates ?? []
  const packageCount = cfg.packageCount ?? 0

  mockFrom.mockImplementation((table: string) => {
    if (table === 'treatments') {
      let updatePayload: Record<string, unknown> | null = null
      const builder: Record<string, unknown> = {
        // Carga: select(...).eq(...).maybeSingle()
        select: vi.fn(() => builder),
        // Update: update(...).eq(...)  (terminal)
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload
          return builder
        }),
        eq: vi.fn(() => {
          // .eq es terminal en el UPDATE de treatments → devolver { error: null }
          if (updatePayload) {
            cfg.trUpdates!.push(updatePayload)
            return Promise.resolve({ error: null })
          }
          return builder
        }),
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
      let isCount = false
      let updatePayload: Record<string, unknown> | null = null
      const builder: Record<string, unknown> = {
        select: vi.fn((_col: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) isCount = true
          return builder
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload
          return builder
        }),
        eq: vi.fn((col: string, val: string) => {
          // UPDATE package_id: .update().eq('appointment_id', id) es terminal
          if (updatePayload && col === 'appointment_id') {
            cfg.updatedApptIds!.push(val)
            return Promise.resolve({ error: null })
          }
          return builder
        }),
        in: vi.fn(() => {
          // count query: .select(col,{count,head}).eq('package_id').in('status')
          if (isCount) return Promise.resolve({ count: packageCount, error: null })
          return builder
        }),
      }
      return builder
    }

    throw new Error(`unexpected table ${table}`)
  })

  return cfg
}

function defaultTreatment(): Record<string, unknown> {
  return {
    treatment_id: TREATMENT_ID,
    patient_id: PATIENT,
    service_id: SERVICE,
    total_sessions: 2,
    start_date: '2026-06-08', // lunes
    expires_at: null,
    status: 'active',
    pattern: {
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF }], // martes 10:00
    },
  }
}

// shift que matchea el slot martes 10:00 del profesional
function matchingShift(date: string) {
  return {
    open: '10:00',
    close: '10:30',
    slot_start_iso: `${date}T13:00:00Z`,
    slot_end_iso: `${date}T13:30:00Z`,
    service_id: SERVICE,
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: PROF,
    professional_name: 'Dra. Pérez',
  }
}

// Configura mockRpc para distinguir check_clinic_availability vs create_appointment.
function configureRpc(opts: {
  available?: boolean // si true, check_clinic_availability devuelve un shift que matchea
  createResult?: (apptId: string) => Record<string, unknown>
}) {
  const available = opts.available ?? true
  const createResult =
    opts.createResult ??
    ((apptId: string) => ({
      success: true,
      appointment_id: apptId,
      short_id: null,
      duplicate: false,
      error: null,
    }))

  mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'check_clinic_availability') {
      const date = args.p_date as string
      const shifts = available ? [matchingShift(date)] : []
      return Promise.resolve({ data: [{ available, shifts }], error: null })
    }
    if (fn === 'create_appointment') {
      const apptId = args.p_appointment_id as string
      return Promise.resolve({ data: [createResult(apptId)], error: null })
    }
    throw new Error(`unexpected rpc ${fn}`)
  })
}

function makeRequest() {
  return new Request(`http://localhost/api/treatments/${TREATMENT_ID}/generate`, { method: 'POST' })
}

function makeParams(id = TREATMENT_ID) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/treatments/[id]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockLogAudit.mockResolvedValue(undefined)
    configureFrom({})
    configureRpc({})
  })

  // ── Auth / tenant / rol ─────────────────────────────────────────────────────
  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('401 si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(400)
  })

  it('403 si el rol es doctor', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it('permite rol receptionist', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    configureFrom({ packageCount: 2 })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
  })

  // ── Carga del treatment ─────────────────────────────────────────────────────
  it('404 si el treatment no existe', async () => {
    configureFrom({ treatment: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it('409 si el treatment no está active', async () => {
    configureFrom({ treatment: { ...defaultTreatment(), status: 'completed' } })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(409)
  })

  it('422 si el pattern de DB está corrupto', async () => {
    configureFrom({ treatment: { ...defaultTreatment(), pattern: { slots: [] } } })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(422)
  })

  it('500 si falla la carga del treatment', async () => {
    configureFrom({ treatment: null, treatmentLoadError: { message: 'boom' } })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(500)
  })

  // ── Happy path ──────────────────────────────────────────────────────────────
  it('200 happy path: crea N turnos, creados correcto y logAudit treatment_generated', async () => {
    const cfg = configureFrom({ packageCount: 2 })
    configureRpc({ available: true })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.treatment_id).toBe(TREATMENT_ID)
    expect(body.creados).toBe(2) // total_sessions = 2, todas disponibles
    expect(body.salteados).toBe(0)
    expect(body.no_colocados).toBe(0)

    // logAudit invocado con el treatment_id correcto
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_generated',
        entity_type: 'treatment',
        entity_id: TREATMENT_ID,
      }),
    )

    // sessions_remaining recalculado con el count real (2)
    expect(cfg.trUpdates).toContainEqual({ sessions_remaining: 2 })
  })

  it('el UPDATE de package_id usa el appointment_id DEVUELTO por la RPC (no el generado)', async () => {
    const cfg = configureFrom({ packageCount: 2 })
    // La RPC devuelve un appointment_id DISTINTO del p_appointment_id que recibe
    configureRpc({
      createResult: () => ({
        success: true,
        appointment_id: 'RPC-RETURNED-ID',
        short_id: null,
        duplicate: false,
        error: null,
      }),
    })
    await POST(makeRequest(), makeParams())
    // Todos los UPDATE usaron el id devuelto por la RPC
    expect(cfg.updatedApptIds!.length).toBeGreaterThan(0)
    expect(cfg.updatedApptIds!.every((id) => id === 'RPC-RETURNED-ID')).toBe(true)
  })

  it('create_appointment recibe p_booked_via=manual y un p_appointment_id generado', async () => {
    configureFrom({ packageCount: 2 })
    await POST(makeRequest(), makeParams())
    const createCalls = mockRpc.mock.calls.filter((c) => c[0] === 'create_appointment')
    expect(createCalls.length).toBeGreaterThan(0)
    for (const [, args] of createCalls) {
      expect(args.p_booked_via).toBe('manual')
      expect(args.p_appointment_id).toBeTruthy()
      expect(args.p_org_id).toBe('tenant-1') // tenant del JWT
      expect(args.p_professional_id).toBe(PROF)
    }
  })

  it('check_clinic_availability recibe p_org_id del JWT y el professional del slot', async () => {
    configureFrom({ packageCount: 2 })
    await POST(makeRequest(), makeParams())
    const availCalls = mockRpc.mock.calls.filter((c) => c[0] === 'check_clinic_availability')
    expect(availCalls.length).toBeGreaterThan(0)
    for (const [, args] of availCalls) {
      expect(args.p_org_id).toBe('tenant-1')
      expect(args.p_service_id).toBe(SERVICE)
      expect(args.p_professional_id).toBe(PROF)
    }
  })

  // ── Idempotencia ────────────────────────────────────────────────────────────
  it('idempotencia: duplicate=true → creados=0, sin contar duplicados como nuevos', async () => {
    const cfg = configureFrom({ packageCount: 2 }) // ya existían 2 turnos
    configureRpc({
      createResult: () => ({
        success: true,
        appointment_id: 'EXISTING-ID',
        short_id: 'AB12',
        duplicate: true,
        error: null,
      }),
    })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creados).toBe(0) // ninguno nuevo
    // Igual asegura el UPDATE de package_id sobre el turno existente devuelto
    expect(cfg.updatedApptIds!.every((id) => id === 'EXISTING-ID')).toBe(true)
    // sessions_remaining recalculado con count real (2), no con el contador local
    expect(cfg.trUpdates).toContainEqual({ sessions_remaining: 2 })
  })

  // ── Skip de conflicto ───────────────────────────────────────────────────────
  it('skip: check_clinic_availability sin shifts para una fecha → esa ocurrencia se saltea', async () => {
    // total_sessions=2, 1 slot/semana. Si NINGÚN shift matchea, no se coloca
    // nada y se acumulan salteados hasta MAX_WEEKS.
    configureFrom({ packageCount: 0 })
    configureRpc({ available: false })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creados).toBe(0)
    expect(body.no_colocados).toBe(2)
    expect(body.salteados).toBeGreaterThanOrEqual(1)
  })

  it('skip parcial: 1ra ocurrencia en conflicto, resto disponible → no se pierde la sesión', async () => {
    configureFrom({ packageCount: 2 })
    // El martes de la semana 0 (2026-06-09) NO tiene shift; el resto sí.
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === 'check_clinic_availability') {
        const date = args.p_date as string
        const shifts = date === '2026-06-09' ? [] : [matchingShift(date)]
        return Promise.resolve({ data: [{ available: shifts.length > 0, shifts }], error: null })
      }
      if (fn === 'create_appointment') {
        return Promise.resolve({
          data: [
            {
              success: true,
              appointment_id: args.p_appointment_id,
              short_id: null,
              duplicate: false,
              error: null,
            },
          ],
          error: null,
        })
      }
      throw new Error(`unexpected rpc ${fn}`)
    })
    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()
    expect(body.creados).toBe(2) // no se perdió ninguna
    expect(body.salteados).toBeGreaterThanOrEqual(1)
    expect(body.no_colocados).toBe(0)
  })

  // ── Errores de la RPC ───────────────────────────────────────────────────────
  it('create_appointment con success=false (mismatch) → no cuenta como creado', async () => {
    configureFrom({ packageCount: 0 })
    configureRpc({
      createResult: (apptId) => ({
        success: false,
        appointment_id: apptId,
        short_id: null,
        duplicate: false,
        error: 'professional_service_mismatch: el profesional no atiende este servicio',
      }),
    })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creados).toBe(0)
  })
})

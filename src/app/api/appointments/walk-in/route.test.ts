import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
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
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

import { POST } from './route'

function makeJwt(claims: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const TENANT_ID = '5298fcc5-15bf-494c-9655-b49d759cfef4'
const PATIENT_ID = '11111111-1111-4111-8111-111111111111'
const SERVICE_ID = '22222222-2222-4222-8222-222222222222'
const PROFESSIONAL_ID = '33333333-3333-4333-8333-333333333333'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/appointments/walk-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const validBody = {
  patient_id: PATIENT_ID,
  service_id: SERVICE_ID,
  professional_id: PROFESSIONAL_ID,
}

// ── Fabrica de cliente supabase mockeado ──────────────────────────────────────
// La route llama from() para: 'services' (select→eq→maybeSingle),
// 'service_professionals' (select→eq→eq→maybeSingle), 'appointments' dup
// (select→eq×4→gte→lte→maybeSingle) e 'appointments' insert (insert→select→single).
interface SupabaseSetup {
  svc?: { data: unknown; error?: unknown }
  sp?: { data: unknown; error?: unknown }
  dup?: { data: unknown; error?: unknown }
  insertSingle?: ReturnType<typeof vi.fn>
}

function buildFrom({
  svc = { data: { allow_walk_in: true, duration_minutes: 30 }, error: null },
  sp = { data: { professional_id: PROFESSIONAL_ID }, error: null },
  dup = { data: null, error: null },
  insertSingle,
}: SupabaseSetup = {}) {
  const svcChain: Record<string, unknown> = {}
  svcChain.select = vi.fn(() => svcChain)
  svcChain.eq = vi.fn(() => svcChain)
  svcChain.maybeSingle = vi.fn(() => Promise.resolve(svc))

  const spChain: Record<string, unknown> = {}
  spChain.select = vi.fn(() => spChain)
  spChain.eq = vi.fn(() => spChain)
  spChain.maybeSingle = vi.fn(() => Promise.resolve(sp))

  const single =
    insertSingle ??
    vi.fn().mockResolvedValue({ data: { appointment_id: 'apt-new' }, error: null })

  const apptChain: Record<string, unknown> = {}
  apptChain.select = vi.fn(() => apptChain)
  apptChain.eq = vi.fn(() => apptChain)
  apptChain.gte = vi.fn(() => apptChain)
  apptChain.lte = vi.fn(() => apptChain)
  apptChain.maybeSingle = vi.fn(() => Promise.resolve(dup))
  apptChain.insert = vi.fn(() => apptChain)
  apptChain.single = single

  const from = vi.fn((table: string) => {
    if (table === 'services') return svcChain
    if (table === 'service_professionals') return spChain
    return apptChain
  })

  return { from, apptChain, single }
}

describe('POST /api/appointments/walk-in', () => {
  const validToken = makeJwt({ tenant_id: TENANT_ID, app_role: 'receptionist' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: validToken } } })
    mockFrom.mockImplementation(buildFrom().from)
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ app_role: 'receptionist' }) } },
    })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
  })

  it('403 si el rol es doctor (no registra la cola)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'doctor' }) } },
    })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
  })

  it('403 si el rol es otro (no admin/receptionist)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ tenant_id: TENANT_ID, app_role: 'otro' }) } },
    })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
  })

  it('400 si el body es JSON inválido', async () => {
    const res = await POST(makeRequest('not-json'))
    expect(res.status).toBe(400)
  })

  it('400 si el body no cumple el schema (uuid inválido)', async () => {
    const res = await POST(makeRequest({ patient_id: 'x', service_id: 'y', professional_id: 'z' }))
    expect(res.status).toBe(400)
  })

  it('400 service_not_walk_in si el servicio no admite walk-in', async () => {
    mockFrom.mockImplementation(
      buildFrom({ svc: { data: { allow_walk_in: false, duration_minutes: 30 }, error: null } }).from,
    )
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('service_not_walk_in')
  })

  it('400 service_not_walk_in si el servicio no existe', async () => {
    mockFrom.mockImplementation(buildFrom({ svc: { data: null, error: null } }).from)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('service_not_walk_in')
  })

  it('400 si el profesional no atiende ese servicio', async () => {
    mockFrom.mockImplementation(buildFrom({ sp: { data: null, error: null } }).from)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
  })

  it('409 already_in_queue si el paciente ya está esperando hoy', async () => {
    mockFrom.mockImplementation(
      buildFrom({ dup: { data: { appointment_id: 'existing' }, error: null } }).from,
    )
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('already_in_queue')
  })

  it('201 happy path — inserta walk-in confirmado, manual, y llama logAudit', async () => {
    const setup = buildFrom()
    mockFrom.mockImplementation(setup.from)

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.appointment_id).toBe('apt-new')

    // Verifica el payload del insert
    const insertMock = setup.apptChain.insert as ReturnType<typeof vi.fn>
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        patient_id: PATIENT_ID,
        service_id: SERVICE_ID,
        professional_id: PROFESSIONAL_ID,
        status: 'confirmed',
        booked_via: 'manual',
        is_walk_in: true,
      }),
    )

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'walk_in_registered',
        entity_type: 'appointment',
        entity_id: 'apt-new',
      }),
    )
  })

  it('reintenta ante 23505 y termina en 201', async () => {
    const insertSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({ data: { appointment_id: 'apt-retry' }, error: null })
    const setup = buildFrom({ insertSingle })
    mockFrom.mockImplementation(setup.from)

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    expect(insertSingle).toHaveBeenCalledTimes(2)
    const body = await res.json()
    expect(body.appointment_id).toBe('apt-retry')
  })

  it('409 slot_conflict si todos los reintentos dan 23505', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } })
    mockFrom.mockImplementation(buildFrom({ insertSingle }).from)

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('slot_conflict')
    expect(insertSingle).toHaveBeenCalledTimes(3)
  })

  it('500 si el insert falla por un error distinto de 23505', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '55555', message: 'boom' } })
    mockFrom.mockImplementation(buildFrom({ insertSingle }).from)

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })
})

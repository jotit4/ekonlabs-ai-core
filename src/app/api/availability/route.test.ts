import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockRpc, mockParseJwt, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockRpc: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' }),
  mockFrom: vi.fn(),
}))

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

import { GET } from './route'

const SAMPLE_SHIFT = {
  open: '09:00',
  close: '09:30',
  slot_start_iso: '2026-06-04T12:00:00Z',
  slot_end_iso: '2026-06-04T12:30:00Z',
  service_id: 'svc-1',
  service_name: 'Kinesiología',
  require_referral: false,
  professional_id: 'prof-1',
  professional_name: 'Dra. Pérez',
}

function makeRequest(query: string) {
  return new Request(`http://localhost/api/availability?${query}`, { method: 'GET' })
}

describe('GET /api/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockRpc.mockResolvedValue({ data: [{ available: true, shifts: [SAMPLE_SHIFT] }], error: null })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(401)
  })

  it('400 si falta tenant_id en el JWT', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(400)
  })

  it('403 si el rol es doctor', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(403)
  })

  it('permite rol receptionist', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(200)
  })

  it('400 si falta date_from o date_to', async () => {
    const res = await GET(makeRequest('date_from=2026-06-04'))
    expect(res.status).toBe(400)
  })

  it('400 si la fecha está mal formada', async () => {
    const res = await GET(makeRequest('date_from=04-06-2026&date_to=2026-06-04'))
    expect(res.status).toBe(400)
  })

  it('400 si date_to < date_from', async () => {
    const res = await GET(makeRequest('date_from=2026-06-10&date_to=2026-06-04'))
    expect(res.status).toBe(400)
  })

  it('400 si el rango supera 60 días', async () => {
    const res = await GET(makeRequest('date_from=2026-01-01&date_to=2026-06-01'))
    expect(res.status).toBe(400)
  })

  it('200 un día: llama la RPC con p_org_id del JWT y devuelve shifts', async () => {
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days['2026-06-04'].shifts).toHaveLength(1)
    expect(body.days['2026-06-04'].shifts[0]).toMatchObject(SAMPLE_SHIFT)
    expect(body.days['2026-06-04'].available).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(
      'check_clinic_availability',
      expect.objectContaining({ p_org_id: 'tenant-1', p_date: '2026-06-04' }),
    )
  })

  it('el p_org_id enviado a la RPC es el del JWT, NO uno del query', async () => {
    await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04&org_id=evil-tenant'))
    const callArg = mockRpc.mock.calls[0][1]
    expect(callArg.p_org_id).toBe('tenant-1')
  })

  it('rango de 3 días → 3 llamadas a la RPC, una por fecha; 3 claves en days', async () => {
    const res = await GET(makeRequest('date_from=2026-06-02&date_to=2026-06-04'))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledTimes(3)
    const body = await res.json()
    expect(Object.keys(body.days).sort()).toEqual(['2026-06-02', '2026-06-03', '2026-06-04'])
  })

  it('summary=true → free_count = longitud de shifts, sin array shifts', async () => {
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04&summary=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days['2026-06-04']).toEqual({ free_count: 1 })
    expect(body.days['2026-06-04'].shifts).toBeUndefined()
  })

  it('reenvía p_service_id y p_professional_id cuando llegan', async () => {
    await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04&service_id=svc-9&professional_id=prof-9'))
    expect(mockRpc).toHaveBeenCalledWith(
      'check_clinic_availability',
      expect.objectContaining({ p_service_id: 'svc-9', p_professional_id: 'prof-9' }),
    )
  })

  it('500 si la RPC devuelve error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } })
    const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04'))
    expect(res.status).toBe(500)
  })

  describe('all_professionals=true (P0.1 — cualquier profesional)', () => {
    beforeEach(() => {
      // service_professionals → dos profesionales activos del servicio + uno inactivo
      // (que debe filtrarse). RLS filtra por tenant vía el JOIN a professionals.
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { professional_id: 'prof-1', professionals: { professional_id: 'prof-1', active: true } },
                { professional_id: 'prof-2', professionals: { professional_id: 'prof-2', active: true } },
                { professional_id: 'prof-3', professionals: { professional_id: 'prof-3', active: false } },
              ],
              error: null,
            }),
        }),
      })
      // La RPC devuelve un hueco distinto por profesional consultado.
      mockRpc.mockImplementation((_fn: string, args: { p_professional_id?: string }) => {
        const prof = args.p_professional_id ?? 'unknown'
        return Promise.resolve({
          data: [
            {
              available: true,
              shifts: [{ ...SAMPLE_SHIFT, professional_id: prof, professional_name: `Prof ${prof}` }],
            },
          ],
          error: null,
        })
      })
    })

    it('itera los profesionales ACTIVOS del servicio y une sus huecos', async () => {
      const res = await GET(
        makeRequest('date_from=2026-06-04&date_to=2026-06-04&service_id=svc-1&all_professionals=true'),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      const shifts = body.days['2026-06-04'].shifts
      // Solo prof-1 y prof-2 (prof-3 inactivo se filtra) → 2 huecos.
      expect(shifts).toHaveLength(2)
      const profs = shifts.map((s: { professional_id: string }) => s.professional_id).sort()
      expect(profs).toEqual(['prof-1', 'prof-2'])
      // Una llamada a la RPC por profesional activo (no una sola con undefined).
      expect(mockRpc).toHaveBeenCalledWith(
        'check_clinic_availability',
        expect.objectContaining({ p_professional_id: 'prof-1', p_service_id: 'svc-1' }),
      )
      expect(mockRpc).toHaveBeenCalledWith(
        'check_clinic_availability',
        expect.objectContaining({ p_professional_id: 'prof-2', p_service_id: 'svc-1' }),
      )
    })

    it('ignora all_professionals si viene professional_id (no itera)', async () => {
      await GET(
        makeRequest(
          'date_from=2026-06-04&date_to=2026-06-04&service_id=svc-1&professional_id=prof-9&all_professionals=true',
        ),
      )
      // No consulta service_professionals: respeta el profesional concreto.
      expect(mockFrom).not.toHaveBeenCalled()
      expect(mockRpc).toHaveBeenCalledWith(
        'check_clinic_availability',
        expect.objectContaining({ p_professional_id: 'prof-9' }),
      )
    })
  })

  describe('service_ids (grupo — Pedido 1 ISADI 2026-07-16, "Dar un turno" recepción)', () => {
    // UUIDs válidos (formato) para probar el modo grupo — B3 (hardening) exige
    // que cada service_id de la lista sea un UUID.
    const SVC_A = '11111111-1111-1111-1111-111111111111'
    const SVC_B = '22222222-2222-2222-2222-222222222222'

    beforeEach(() => {
      // service_professionals → dos profesionales activos, mismos para cualquier
      // service_id consultado (el mock no distingue por argumento, como el resto
      // de la suite — alcanza para probar la iteración servicio x profesional).
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { professional_id: 'prof-1', professionals: { professional_id: 'prof-1', active: true } },
                { professional_id: 'prof-2', professionals: { professional_id: 'prof-2', active: true } },
              ],
              error: null,
            }),
        }),
      })
      mockRpc.mockImplementation(
        (_fn: string, args: { p_service_id?: string; p_professional_id?: string }) => {
          const svc = args.p_service_id ?? 'unknown'
          const prof = args.p_professional_id ?? 'unknown'
          return Promise.resolve({
            data: [
              {
                available: true,
                shifts: [{ ...SAMPLE_SHIFT, service_id: svc, professional_id: prof, professional_name: `Prof ${prof}` }],
              },
            ],
            error: null,
          })
        },
      )
    })

    it('itera TODOS los service_id del grupo x TODOS sus profesionales activos, uniendo huecos', async () => {
      const res = await GET(
        makeRequest(`date_from=2026-06-04&date_to=2026-06-04&service_ids=${SVC_A},${SVC_B}`),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      const shifts = body.days['2026-06-04'].shifts as { service_id: string; professional_id: string }[]
      // 2 servicios x 2 profesionales = 4 huecos
      expect(shifts).toHaveLength(4)
      const combos = shifts.map((s) => `${s.service_id}__${s.professional_id}`).sort()
      expect(combos).toEqual([`${SVC_A}__prof-1`, `${SVC_A}__prof-2`, `${SVC_B}__prof-1`, `${SVC_B}__prof-2`])
    })

    it('con professional_id explícito junto a service_ids, NO consulta service_professionals (usa ese profesional para cada servicio)', async () => {
      mockFrom.mockClear()
      const res = await GET(
        makeRequest(
          `date_from=2026-06-04&date_to=2026-06-04&service_ids=${SVC_A},${SVC_B}&professional_id=prof-9`,
        ),
      )
      expect(res.status).toBe(200)
      expect(mockFrom).not.toHaveBeenCalled()
      const body = await res.json()
      const shifts = body.days['2026-06-04'].shifts as { professional_id: string }[]
      expect(shifts).toHaveLength(2)
      for (const s of shifts) expect(s.professional_id).toBe('prof-9')
    })

    it('service_ids tiene prioridad sobre service_id cuando ambos llegan', async () => {
      const res = await GET(
        makeRequest(
          `date_from=2026-06-04&date_to=2026-06-04&service_id=svc-legacy&service_ids=${SVC_A},${SVC_B}`,
        ),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      const shifts = body.days['2026-06-04'].shifts as { service_id: string }[]
      const svcIds = shifts.map((s) => s.service_id)
      expect(svcIds).not.toContain('svc-legacy')
      expect(svcIds.sort()).toEqual([SVC_A, SVC_A, SVC_B, SVC_B])
    })

    it('dedupe: ids repetidos no multiplican las llamadas ni cambian el resultado', async () => {
      const resRepeated = await GET(
        makeRequest(`date_from=2026-06-04&date_to=2026-06-04&service_ids=${SVC_A},${SVC_A},${SVC_A}`),
      )
      expect(resRepeated.status).toBe(200)
      const bodyRepeated = await resRepeated.json()
      const shiftsRepeated = bodyRepeated.days['2026-06-04'].shifts as { service_id: string; professional_id: string }[]
      const callsWithRepeated = mockRpc.mock.calls.length

      mockRpc.mockClear()
      mockFrom.mockClear()

      const resSingle = await GET(
        makeRequest(`date_from=2026-06-04&date_to=2026-06-04&service_ids=${SVC_A}`),
      )
      expect(resSingle.status).toBe(200)
      const bodySingle = await resSingle.json()
      const shiftsSingle = bodySingle.days['2026-06-04'].shifts as { service_id: string; professional_id: string }[]
      const callsWithSingle = mockRpc.mock.calls.length

      // service_ids=A,A,A debe comportarse EXACTAMENTE igual que service_ids=A
      // (mismo número de llamadas a la RPC, mismos huecos).
      expect(callsWithRepeated).toBe(callsWithSingle)
      expect(shiftsRepeated).toEqual(shiftsSingle)
    })

    it('400 si service_ids excede MAX_SERVICE_IDS (11 elementos)', async () => {
      const tooMany = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777',
        '88888888-8888-8888-8888-888888888888',
        '99999999-9999-9999-9999-999999999999',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ].join(',')
      const res = await GET(
        makeRequest(`date_from=2026-06-04&date_to=2026-06-04&service_ids=${tooMany}`),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/10/)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('400 si algún service_id de la lista no es un UUID válido', async () => {
      const res = await GET(
        makeRequest(`date_from=2026-06-04&date_to=2026-06-04&service_ids=${SVC_A},not-a-uuid`),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/inválido/)
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe('diagnósticos de availability', () => {
    beforeEach(() => {
      mockRpc.mockResolvedValue({ data: [{ available: false, shifts: [] }], error: null })
    })

    it('devuelve no_schedule si no existen filas en service_hours ni professional_schedules', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04&service_id=11111111-1111-1111-1111-111111111111&professional_id=22222222-2222-2222-2222-222222222222'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.diagnostic).toEqual({
        code: 'no_schedule',
        message: 'El profesional no tiene horarios configurados para este día de la semana.',
      })
    })

    it('devuelve professional_blocked si existen horarios pero hay bloqueos en blocked_times', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'service_hours' || table === 'professional_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'some-id' }], error: null }),
          }
        }
        if (table === 'blocked_times') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ block_id: 'some-block-id' }], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      })

      const res = await GET(makeRequest('date_from=2026-06-04&date_to=2026-06-04&service_id=11111111-1111-1111-1111-111111111111&professional_id=22222222-2222-2222-2222-222222222222'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.diagnostic).toEqual({
        code: 'professional_blocked',
        message: 'El profesional se encuentra de vacaciones o bloqueado.',
      })
    })
  })
})

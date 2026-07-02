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
})

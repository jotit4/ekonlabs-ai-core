import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser, mockFrom, mockSelect, mockEq, mockOrder } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
    mockEq: vi.fn(),
    mockOrder: vi.fn(),
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
      },
      from: mockFrom,
    })
  ),
}))

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_OBRAS_SOCIALES = [
  { entidad: 'Galeno', plan_nombre: 'Plan Bronce' },
  { entidad: 'Galeno', plan_nombre: 'Plan Plata' },
  { entidad: 'OSEP', plan_nombre: 'Plan 100' },
  { entidad: 'OSEP', plan_nombre: 'Plan 200' },
  { entidad: 'PAMI', plan_nombre: 'Plan PAMI' },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/obras-sociales', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Chain: .from('obras_sociales').select(...).eq('activo', true).order(...).order(...)
    mockOrder.mockResolvedValue({ data: MOCK_OBRAS_SOCIALES, error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    // Second .order() call — returns the same mock (chained)
    mockOrder.mockReturnValueOnce({ order: mockOrder })
    mockOrder.mockResolvedValue({ data: MOCK_OBRAS_SOCIALES, error: null })
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 200 con estructura { entidades: [...] } cuando el usuario está autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entidades).toBeDefined()
    expect(Array.isArray(body.entidades)).toBe(true)
  })

  it('agrupa correctamente por entidad: cada elemento tiene entidad (string) y planes (string[])', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await GET()
    const body = await res.json()

    expect(body.entidades.length).toBeGreaterThan(0)

    for (const item of body.entidades) {
      expect(typeof item.entidad).toBe('string')
      expect(Array.isArray(item.planes)).toBe(true)
      expect(item.planes.length).toBeGreaterThan(0)
      for (const plan of item.planes) {
        expect(typeof plan).toBe('string')
      }
    }

    // OSEP debe tener los dos planes del mock
    const osep = body.entidades.find((e: { entidad: string }) => e.entidad === 'OSEP')
    expect(osep).toBeDefined()
    expect(osep.planes).toContain('Plan 100')
    expect(osep.planes).toContain('Plan 200')
  })
})

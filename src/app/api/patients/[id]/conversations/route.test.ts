import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
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
      },
      from: mockFrom,
    })
  ),
}))

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PATIENT_ID = 'patient-test-uuid-1'
const PHONE = '+5491133334444'

function makeContext(id: string = PATIENT_ID) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest() {
  return new Request(`http://localhost/api/patients/${PATIENT_ID}/conversations`, {
    method: 'GET',
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/patients/[id]/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    // Necesitamos que mockFrom no interfiera
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('retorna 200 con array de conversaciones cuando el paciente tiene conversaciones', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        role: 'user',
        content: 'Hola, quiero un turno',
        created_at: '2026-05-10T10:00:00Z',
        phone_number: PHONE,
      },
      {
        id: 'conv-2',
        role: 'assistant',
        content: 'Claro, ¿qué día le vendría bien?',
        created_at: '2026-05-10T10:01:00Z',
        phone_number: PHONE,
      },
    ]

    // Primera llamada: patients.select → patient con phone_number
    // Segunda llamada: conversations.select → lista de conversaciones
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // patients query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phone_number: PHONE } }),
            }),
          }),
        }
      }
      // conversations query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockConversations, error: null }),
          }),
        }),
      }
    })

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toHaveLength(2)
    expect(body.conversations[0].role).toBe('user')
  })

  it('retorna 200 con array vacío cuando el paciente no tiene phone_number', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { phone_number: null } }),
        }),
      }),
    })

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toEqual([])
  })

  it('retorna 404 si el paciente no existe', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const res = await GET(makeRequest(), makeContext())
    expect(res.status).toBe(404)
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — variables referenciadas en factories de vi.mock
const { mockGetUser, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockLogAudit: vi.fn(),
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
    })
  ),
}))

// Mock logAudit
vi.mock('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}))

import { POST } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(patientId = 'patient-uuid-1') {
  return new Request(`http://localhost/api/patients/${patientId}/access-log`, {
    method: 'POST',
  })
}

function makeContext(id = 'patient-uuid-1') {
  return { params: Promise.resolve({ id }) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/patients/[id]/access-log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogAudit.mockResolvedValue(undefined)
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('retorna 401 si no hay sesión activa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 200 con { ok: true } para usuario autenticado', async () => {
    const res = await POST(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('llama logAudit con action patient_accessed y entity_id correcto', async () => {
    await POST(makeRequest('patient-uuid-42'), makeContext('patient-uuid-42'))

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'patient_accessed',
        entity_type: 'patient',
        entity_id: 'patient-uuid-42',
      })
    )
  })
})

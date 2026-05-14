import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
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

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

// Mock de cadena de Supabase para SELECT (patients)
function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

// Mock de cadena de Supabase para UPDATE
function makeUpdateChain(result: { error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  }
}

// ── Setup por defecto ────────────────────────────────────────────────────────

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid-1' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4iLCJ0ZW5hbnRfaWQiOiI1Mjk4ZmNjNS0xNWJmLTQ5NGMtOTY1NS1iNDlkNzU5Y2ZlZjQifQ.sig',
      },
    },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/patients/[id]/deletion-request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay sesión autenticada', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'doctor-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'rec-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'some-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(403)
  })

  it('retorna 404 si el paciente no existe', async () => {
    setupAdminAuth()

    const selectChain = makeSelectChain({ data: null, error: null })
    mockFrom.mockReturnValue(selectChain)

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Paciente no encontrado')
  })

  it('retorna 409 si el paciente ya tiene eliminación pendiente', async () => {
    setupAdminAuth()

    const selectChain = makeSelectChain({
      data: {
        patient_id: 'p1',
        full_name: 'Juan Pérez',
        deletion_requested_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    })
    mockFrom.mockReturnValue(selectChain)

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Este paciente ya tiene una eliminación pendiente')
  })

  it('retorna 200 con success y deletion_effective_at cuando todo es válido', async () => {
    setupAdminAuth()

    // mockFrom devuelve diferentes cadenas según cuántas veces se llama
    mockFrom
      .mockReturnValueOnce(
        makeSelectChain({
          data: { patient_id: 'p1', full_name: 'Juan Pérez', deletion_requested_at: null },
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeUpdateChain({ error: null })
      )

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; deletion_effective_at: string }
    expect(body.success).toBe(true)
    expect(body.deletion_effective_at).toBeTruthy()

    // Verificar que deletion_effective_at es aprox. 30 días después
    const effectiveDate = new Date(body.deletion_effective_at)
    const now = new Date()
    const diffDays = Math.round((effectiveDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
  })

  it('retorna 500 si el UPDATE en patients falla', async () => {
    setupAdminAuth()

    mockFrom
      .mockReturnValueOnce(
        makeSelectChain({
          data: { patient_id: 'p1', full_name: 'Juan Pérez', deletion_requested_at: null },
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeUpdateChain({ error: { message: 'DB error' } })
      )

    const res = await POST(new Request('http://localhost', { method: 'POST' }), makeContext('p1'))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al procesar la solicitud')
  })
})


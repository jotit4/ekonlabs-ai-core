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

import { GET } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelectOrderLimitChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
  return chain
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid-1' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJhcHBfcm9sZSI6ImFkbWluIiwidGVuYW50X2lkIjoiNTI5OGZjYzUtMTViZi00OTRjLTk2NTUtYjQ5ZDc1OWNmZWY0In0.sig',
      },
    },
  })
  mockParseJwt.mockReturnValue({
    app_role: 'admin',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  })
}

const SAMPLE_HISTORY = [
  {
    id: 'hist-1',
    tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
    user_id: 'admin-uuid-1',
    previous_content: 'prompt anterior',
    new_content: 'prompt nuevo',
    changed_at: '2026-05-12T10:00:00Z',
  },
]

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/agente/prompt-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doctor-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 403 si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 200 con { data: SystemPromptHistoryEntry[] } cuando admin con sesión válida', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderLimitChain({ data: SAMPLE_HISTORY, error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof SAMPLE_HISTORY }
    expect(body.data).toEqual(SAMPLE_HISTORY)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('hist-1')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderLimitChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener historial')
  })

  it('retorna array vacío { data: [] } si no hay entradas', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectOrderLimitChain({ data: [], error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toEqual([])
  })
})

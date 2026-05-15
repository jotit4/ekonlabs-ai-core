import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }),
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

import { GET, POST } from './route'

// ── Datos de prueba ───────────────────────────────────────────────────────────

const mockNote = {
  note_id: 'note-uuid-1',
  content: 'Nota de prueba',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  author_id: 'user-uuid-1',
}

// Helper para construir context con params
function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

// Helper para construir Request con body JSON
function makeRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/patients/p1/clinical-notes', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/patients/[id]/clinical-notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: sesión con rol admin para que tests existentes no sean afectados por el nuevo check de rol
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-admin-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
  })

  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso (receptionist)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-uuid-1' } }, error: null })
    mockParseJwt.mockReturnValueOnce({ app_role: 'receptionist', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 200 con array de notas si autenticado', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockNote], error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { notes: typeof mockNote[] }
    expect(body.notes).toHaveLength(1)
    expect(body.notes[0].note_id).toBe('note-uuid-1')
  })

  it('retorna 200 con array vacío si no hay notas', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { notes: unknown[] }
    expect(body.notes).toEqual([])
  })

  it('retorna 500 si hay error de base de datos', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(500)
  })
})

// ── Tests POST ────────────────────────────────────────────────────────────────

describe('POST /api/patients/[id]/clinical-notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
  })

  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(makeRequest({ content: 'texto' }), makeContext('p1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso (receptionist)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    })
    mockParseJwt.mockReturnValueOnce({ app_role: 'receptionist', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

    const res = await POST(makeRequest({ content: 'Nota' }), makeContext('p1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si content está vacío', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    })

    const res = await POST(makeRequest({ content: '   ' }), makeContext('p1'))
    expect(res.status).toBe(400)
  })

  it('retorna 201 con nota creada si content válido', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    })

    const mockChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockNote, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await POST(makeRequest({ content: 'Nota válida' }), makeContext('p1'))
    expect(res.status).toBe(201)
    const body = await res.json() as { note: typeof mockNote }
    expect(body.note.note_id).toBe('note-uuid-1')
  })

  it('retorna 500 si falla el insert', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    })

    const mockChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await POST(makeRequest({ content: 'Nota válida' }), makeContext('p1'))
    expect(res.status).toBe(500)
  })
})

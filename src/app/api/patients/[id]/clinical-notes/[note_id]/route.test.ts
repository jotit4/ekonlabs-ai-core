import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

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

import { PATCH } from './route'

// ── Datos de prueba ───────────────────────────────────────────────────────────

const mockNote = {
  note_id: 'note-uuid-1',
  content: 'Nota actualizada',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  author_id: 'user-uuid-1',
}

// Helper para construir context con params
function makeContext(id: string, note_id: string) {
  return { params: Promise.resolve({ id, note_id }) }
}

// Helper para construir Request con body JSON
function makeRequest(body: unknown) {
  return new Request('http://localhost/api/patients/p1/clinical-notes/note-uuid-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/patients/[id]/clinical-notes/[note_id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await PATCH(makeRequest({ content: 'texto' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 400 si content está vacío', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const res = await PATCH(makeRequest({ content: '' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(400)
  })

  it('retorna 200 con nota actualizada si PATCH válido', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockNote, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await PATCH(makeRequest({ content: 'Nota actualizada' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { note: typeof mockNote }
    expect(body.note.note_id).toBe('note-uuid-1')
  })

  it('retorna 404 si la nota no existe', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await PATCH(makeRequest({ content: 'Nota actualizada' }), makeContext('p1', 'inexistente'))
    expect(res.status).toBe(404)
  })
})

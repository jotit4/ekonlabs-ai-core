import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'doctor', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }),
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
    // Default: doctor autenticado como autor de la nota
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-doctor-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })
  })

  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await PATCH(makeRequest({ content: 'texto' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso (receptionist)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-uuid-1' } }, error: null })
    mockParseJwt.mockReturnValueOnce({ app_role: 'receptionist', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

    const res = await PATCH(makeRequest({ content: 'texto' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 403 si doctor intenta editar nota de otro médico', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doctor-2' } } })
    // parseJwtPayload retorna doctor por defecto

    // La nota pertenece a doctor-1, no a doctor-2
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { author_id: 'doctor-1' }, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await PATCH(makeRequest({ content: 'Intento de edición' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Sin permiso para editar esta nota')
  })

  it('PATCH permite a admin editar nota de cualquier doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-user' } } })
    mockParseJwt.mockReturnValueOnce({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

    // Admin no hace SELECT de author_id — va directo al UPDATE
    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockNote, author_id: 'otro-doctor' }, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await PATCH(makeRequest({ content: 'Editado por admin' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(200)
  })

  it('retorna 400 si content está vacío', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    // El check de autor necesita el FROM para el SELECT de author_id
    // Como el user.id === author_id en el mock, no entrará en el 403
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { author_id: 'user-uuid-1' }, error: null }),
    }
    mockFrom.mockReturnValue(mockChain)

    const res = await PATCH(makeRequest({ content: '' }), makeContext('p1', 'note-uuid-1'))
    expect(res.status).toBe(400)
  })

  it('retorna 200 con nota actualizada si PATCH válido', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // SELECT de author_id para check de autor
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { author_id: 'user-uuid-1' }, error: null }),
        }
      }
      // UPDATE de la nota
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockNote, error: null }),
      }
    })

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

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // SELECT de author_id — nota existe, mismo autor
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { author_id: 'user-uuid-1' }, error: null }),
        }
      }
      // UPDATE — no encuentra la nota
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    const res = await PATCH(makeRequest({ content: 'Nota actualizada' }), makeContext('p1', 'inexistente'))
    expect(res.status).toBe(404)
  })
})

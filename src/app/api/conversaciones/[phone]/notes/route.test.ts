import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

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

import { GET, POST } from './route'

function makeJwt(claims: Record<string, unknown> = { tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeContext(phone = '+5491111111111') {
  return { params: Promise.resolve({ phone }) }
}

function makeGetRequest() {
  return new Request('http://localhost/api/conversaciones/+5491111111111/notes', { method: 'GET' })
}

function makePostRequest(body: unknown = { body: 'Nota de prueba' }) {
  return new Request('http://localhost/api/conversaciones/+5491111111111/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/conversaciones/[phone]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1' })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET(makeGetRequest(), makeContext())

    expect(res.status).toBe(401)
  })

  it('200 y lista vacía cuando no hay notas', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const res = await GET(makeGetRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notes).toEqual([])
  })

  it('200 y devuelve notas ordenadas', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const notes = [
      { id: 'note-1', body: 'Primera nota', created_at: '2026-06-25T10:00:00Z' },
      { id: 'note-2', body: 'Segunda nota', created_at: '2026-06-25T09:00:00Z' },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: notes, error: null }),
        }),
      }),
    })

    const res = await GET(makeGetRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notes).toHaveLength(2)
    expect(body.notes[0].id).toBe('note-1')
  })

  it('500 si la query falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    })

    const res = await GET(makeGetRequest(), makeContext())

    expect(res.status).toBe(500)
  })
})

// ─── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/conversaciones/[phone]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1' })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const res = await POST(makePostRequest(), makeContext())

    expect(res.status).toBe(401)
  })

  it('400 si body está vacío', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })

    const res = await POST(makePostRequest({ body: '' }), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('vacía')
  })

  it('400 si body supera 2000 caracteres', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })

    const res = await POST(makePostRequest({ body: 'x'.repeat(2001) }), makeContext())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('2000')
  })

  it('201 y devuelve la nota creada en happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1', name: 'Ana' }) } } })
    mockParseJwt.mockReturnValue({ tenant_id: 'tenant-1', name: 'Ana' })

    const createdNote = {
      id: 'note-uuid',
      tenant_id: 'tenant-1',
      phone_number: '+5491111111111',
      author_user: 'user-1',
      author_name: 'Ana',
      body: 'Nota de prueba',
      created_at: '2026-06-25T10:00:00Z',
    }

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createdNote, error: null }),
        }),
      }),
    })

    const res = await POST(makePostRequest({ body: 'Nota de prueba' }), makeContext())

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.note.body).toBe('Nota de prueba')
    expect(body.note.author_name).toBe('Ana')
  })

  it('500 si el insert falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt({ tenant_id: 'tenant-1' }) } } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    })

    const res = await POST(makePostRequest({ body: 'Nota de prueba' }), makeContext())

    expect(res.status).toBe(500)
  })
})

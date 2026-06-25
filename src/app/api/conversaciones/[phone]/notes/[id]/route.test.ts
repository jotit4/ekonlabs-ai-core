import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
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
      },
      from: mockFrom,
    })
  ),
}))

import { DELETE } from './route'

function makeContext(phone = '+5491111111111', id = 'note-uuid-1') {
  return { params: Promise.resolve({ phone, id }) }
}

function makeRequest() {
  return new Request('http://localhost/api/conversaciones/+5491111111111/notes/note-uuid-1', {
    method: 'DELETE',
  })
}

describe('DELETE /api/conversaciones/[phone]/notes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await DELETE(makeRequest(), makeContext())

    expect(res.status).toBe(401)
  })

  it('200 y { status: ok } en happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const res = await DELETE(makeRequest(), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('500 si la eliminación falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      }),
    })

    const res = await DELETE(makeRequest(), makeContext())

    expect(res.status).toBe(500)
  })

  it('se llama delete con el id correcto', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockFrom.mockReturnValue({ delete: deleteMock })

    await DELETE(makeRequest(), makeContext('+5491111111111', 'specific-note-id'))

    expect(deleteMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('id', 'specific-note-id')
  })
})

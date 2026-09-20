import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockEqSelect = vi.hoisted(() => vi.fn())
const mockSingleSelect = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockEqUpdate = vi.hoisted(() => vi.fn())
const mockSelectUpdate = vi.hoisted(() => vi.fn())
const mockSingleUpdate = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

function setupAuth(userId = 'user-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
}

function setupNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
}

import { GET, PATCH } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  // SELECT chain: from → select → eq → single
  mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate }))
  mockSelect.mockReturnValue({ eq: mockEqSelect })
  mockEqSelect.mockReturnValue({ single: mockSingleSelect })
  // UPDATE chain: from → update → eq → select → single
  mockUpdate.mockReturnValue({ eq: mockEqUpdate })
  mockEqUpdate.mockReturnValue({ select: mockSelectUpdate })
  mockSelectUpdate.mockReturnValue({ single: mockSingleUpdate })
})

describe('GET /api/me/preferences', () => {
  it('retorna 401 si no hay sesión', async () => {
    setupNoAuth()
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBeDefined()
  })

  it('retorna la preferencia guardada del usuario', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: { agenda_view: 'todos' } }, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ agenda_view: 'todos' })
  })

  it('retorna {} cuando el usuario no tiene preferencias guardadas', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: {} }, error: null })
    const res = await GET()
    const body = await res.json()
    expect(body.data).toEqual({})
  })

  it('descarta claves/valores mal formados de una fila corrupta en vez de romper', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({
      data: { preferences: { agenda_view: 'algo-invalido', otra_clave: 'x' } },
      error: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.data).toEqual({})
  })

  it('nunca devuelve la fila entera del usuario (solo la clave `data` con preferencias conocidas)', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({
      data: { preferences: { agenda_view: 'foco' } },
      error: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['data'])
    expect(body).not.toHaveProperty('role')
    expect(body).not.toHaveProperty('tenant_id')
  })

  it('retorna 500 si falla la query', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/me/preferences', () => {
  it('retorna 401 si no hay sesión', async () => {
    setupNoAuth()
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('PATCH válido: guarda agenda_view y lo devuelve', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: {} }, error: null })
    mockSingleUpdate.mockResolvedValue({ data: { preferences: { agenda_view: 'todos' } }, error: null })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ agenda_view: 'todos' })
    expect(mockUpdate).toHaveBeenCalledWith({ preferences: { agenda_view: 'todos' } })
  })

  it('PATCH con una clave desconocida: la descarta (no rompe, no la persiste) sin tocar las conocidas', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: { agenda_view: 'foco' } }, error: null })
    mockSingleUpdate.mockResolvedValue({ data: { preferences: { agenda_view: 'foco' } }, error: null })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ clave_inventada: 'lo-que-sea' }),
      }),
    )
    expect(res.status).toBe(200)
    // El merge nunca incluye la clave desconocida — solo persiste lo que ya
    // había (agenda_view: 'foco', sin tocar).
    expect(mockUpdate).toHaveBeenCalledWith({ preferences: { agenda_view: 'foco' } })
    const body = await res.json()
    expect(body.data).not.toHaveProperty('clave_inventada')
  })

  it('PATCH con un valor inválido para agenda_view: 400, no llega a escribir', async () => {
    setupAuth()
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'rehab' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PATCH con body que no es JSON: 400', async () => {
    setupAuth()
    const res = await PATCH(
      new Request('http://t/api/me/preferences', { method: 'PATCH', body: '{not-json' }),
    )
    expect(res.status).toBe(400)
  })

  it('mergea sin perder otras claves ya guardadas (merge parcial, no reemplazo total)', async () => {
    setupAuth()
    // preferences ya tiene agenda_view guardado; el PATCH manda el mismo
    // valor (simula un guardado repetido) — el merge debe conservarlo.
    mockSingleSelect.mockResolvedValue({ data: { preferences: { agenda_view: 'foco' } }, error: null })
    mockSingleUpdate.mockResolvedValue({ data: { preferences: { agenda_view: 'todos' } }, error: null })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ preferences: { agenda_view: 'todos' } })
  })

  it('conserva una clave que esta versión de la API no conoce (no la borra al guardar)', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({
      data: { preferences: { agenda_view: 'foco', clave_futura: 'x' } },
      error: null,
    })
    mockSingleUpdate.mockResolvedValue({ data: { preferences: { agenda_view: 'todos' } }, error: null })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ preferences: { agenda_view: 'todos', clave_futura: 'x' } })
  })

  it('un `preferences` corrupto en la base no rompe el guardado', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: ['no', 'es', 'objeto'] }, error: null })
    mockSingleUpdate.mockResolvedValue({ data: { preferences: { agenda_view: 'foco' } }, error: null })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'foco' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ preferences: { agenda_view: 'foco' } })
  })

  it('retorna 500 si falla la lectura previa', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(500)
  })

  it('retorna 500 si falla el update', async () => {
    setupAuth()
    mockSingleSelect.mockResolvedValue({ data: { preferences: {} }, error: null })
    mockSingleUpdate.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const res = await PATCH(
      new Request('http://t/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ agenda_view: 'todos' }),
      }),
    )
    expect(res.status).toBe(500)
  })
})

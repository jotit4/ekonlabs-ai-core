import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
    })
  ),
}))

import { GET } from './route'

describe('GET /api/tenant/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    const response = await GET()
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    const response = await GET()
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('retorna { uses_native_calendar: false } cuando la query tiene uses_native_calendar = false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: false, rules: {} },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: false, agenda_area_focus: null })
  })

  it('retorna { uses_native_calendar: true } cuando la query tiene uses_native_calendar = true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: true, rules: {} },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: true, agenda_area_focus: null })
  })

  // ── agenda_area_focus (tenants.rules, migración 062) ───────────────────────
  // Ajuste ISADI aislado por tenant: solo el valor 'rehab' habilita el recorte;
  // cualquier otra cosa (ausente, otro string, tipo inesperado) equivale a
  // "sin foco" — nunca se recorta la agenda de un tenant sin este ajuste.
  it('retorna agenda_area_focus: "rehab" cuando tenants.rules.agenda_area_focus = "rehab" (ISADI)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: false, rules: { agenda_area_focus: 'rehab' } },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: false, agenda_area_focus: 'rehab' })
  })

  it('retorna agenda_area_focus: null cuando rules.agenda_area_focus está ausente (tenant sin el ajuste)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: false, rules: { absence_policy: { notice_window_hours: 24 } } },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: false, agenda_area_focus: null })
  })

  it('retorna agenda_area_focus: null cuando rules.agenda_area_focus tiene un valor inválido (no "rehab")', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: false, rules: { agenda_area_focus: 'otra-cosa' } },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: false, agenda_area_focus: null })
  })

  it('retorna agenda_area_focus: null cuando rules es null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { uses_native_calendar: false, rules: null },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ uses_native_calendar: false, agenda_area_focus: null })
  })

  // ── Contrato de la respuesta ────────────────────────────────────────────────
  // La ruta lee `rules` entero de la DB (para poder leer `agenda_area_focus`),
  // pero SOLO debe exponer los dos campos públicos — nunca `rules` completo ni
  // ninguna de sus otras claves (ej. `absence_policy`). Este test falla si
  // alguien cambia la ruta para devolver `rules` tal cual (spread o campo
  // directo): `Object.keys` detecta cualquier clave extra, cosa que
  // `toEqual` por sí solo también haría, pero acá lo hacemos explícito e
  // independiente del resto de los valores.
  it('la respuesta expone SOLO uses_native_calendar y agenda_area_focus, aunque rules tenga otras claves', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            uses_native_calendar: true,
            rules: {
              agenda_area_focus: 'rehab',
              absence_policy: { notice_window_hours: 24, allow_recovery_on_notice: true, no_show_consequence: 'lose' },
              otra_clave_futura: { algo: 'que-no-deberia-salir' },
            },
          },
          error: null,
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['agenda_area_focus', 'uses_native_calendar'])
    expect(body).not.toHaveProperty('rules')
    expect(body).not.toHaveProperty('absence_policy')
    expect(body).not.toHaveProperty('otra_clave_futura')
  })

  it('retorna 500 si la query de Supabase falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB error' },
        }),
      }),
    })

    const response = await GET()
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })
})

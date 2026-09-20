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
    expect(body).toEqual({
      uses_native_calendar: false,
      agenda_area_focus: null,
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
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
    expect(body).toEqual({
      uses_native_calendar: true,
      agenda_area_focus: null,
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
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
    expect(body).toEqual({
      uses_native_calendar: false,
      agenda_area_focus: 'rehab',
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
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
    expect(body).toEqual({
      uses_native_calendar: false,
      agenda_area_focus: null,
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
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
    expect(body).toEqual({
      uses_native_calendar: false,
      agenda_area_focus: null,
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
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
    expect(body).toEqual({
      uses_native_calendar: false,
      agenda_area_focus: null,
      agenda_area_focus_label: 'Rehabilitación',
      reception_groups: {},
      reception_default_group: null,
    })
  })

  // ── reception_groups / reception_default_group (tenants.rules, migración 069) ──
  // "Fisioterapia" deja de ser un nombre fijo en el código: cada cuenta
  // configura sus propios grupos acá. La ruta descarta cualquier entrada mal
  // formada en vez de devolverla tal cual (ver normalizeReceptionGroups).
  describe('reception_groups / reception_default_group', () => {
    function mockRules(rules: Record<string, unknown>) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-abc' } },
        error: null,
      })
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { uses_native_calendar: false, rules },
            error: null,
          }),
        }),
      })
    }

    it('retorna reception_groups y reception_default_group configurados (ISADI, tras la migración 069)', async () => {
      mockRules({
        reception_groups: {
          fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
          pileta: { label: 'Pileta', main_service_id: null },
          pilates: { label: 'Pilates', main_service_id: null },
        },
        reception_default_group: 'fisioterapia',
      })

      const response = await GET()
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.reception_groups).toEqual({
        fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
        pileta: { label: 'Pileta', main_service_id: null },
        pilates: { label: 'Pilates', main_service_id: null },
      })
      expect(body.reception_default_group).toBe('fisioterapia')
    })

    it('descarta claves que pisarían el prototipo (__proto__, constructor, prototype)', async () => {
      mockRules({
        reception_groups: JSON.parse(
          '{"__proto__":{"label":"X","main_service_id":null},"constructor":{"label":"Y","main_service_id":null},"fisioterapia":{"label":"Fisioterapia","main_service_id":null}}',
        ),
      })

      const response = await GET()
      const body = await response.json()
      expect(Object.keys(body.reception_groups)).toEqual(['fisioterapia'])
    })

    it('expone `order` solo cuando es un número finito; un `order` inválido se ignora sin descartar el grupo', async () => {
      mockRules({
        reception_groups: {
          fisioterapia: { label: 'Fisioterapia', main_service_id: null, order: 1 },
          pileta: { label: 'Pileta', main_service_id: null, order: 'primero' },
          pilates: { label: 'Pilates', main_service_id: null },
        },
      })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({
        fisioterapia: { label: 'Fisioterapia', main_service_id: null, order: 1 },
        pileta: { label: 'Pileta', main_service_id: null },
        pilates: { label: 'Pilates', main_service_id: null },
      })
    })

    it('retorna reception_groups: {} y reception_default_group: null cuando la cuenta no tiene el ajuste (cuenta demo)', async () => {
      mockRules({})

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({})
      expect(body.reception_default_group).toBeNull()
    })

    it('descarta una entrada de reception_groups sin label', async () => {
      mockRules({
        reception_groups: { fisioterapia: { main_service_id: 'svc-fisio' } },
      })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({})
    })

    it('descarta una entrada de reception_groups con label vacío', async () => {
      mockRules({
        reception_groups: { fisioterapia: { label: '   ', main_service_id: null } },
      })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({})
    })

    it('descarta una entrada de reception_groups con main_service_id de un tipo inválido', async () => {
      mockRules({
        reception_groups: { fisioterapia: { label: 'Fisioterapia', main_service_id: 123 } },
      })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({})
    })

    it('conserva las entradas válidas y descarta solo las mal formadas dentro del mismo objeto', async () => {
      mockRules({
        reception_groups: {
          fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
          rota: { main_service_id: 'svc-x' },
        },
      })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({
        fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
      })
    })

    it('reception_groups: {} cuando el valor no es un objeto (ej. un array o un string)', async () => {
      mockRules({ reception_groups: ['fisioterapia'] })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_groups).toEqual({})
    })

    it('reception_default_group: null cuando el valor no es un string no vacío', async () => {
      mockRules({ reception_default_group: '' })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_default_group).toBeNull()
    })

    it('reception_default_group: null cuando el valor es de un tipo inválido', async () => {
      mockRules({ reception_default_group: 123 })

      const response = await GET()
      const body = await response.json()
      expect(body.reception_default_group).toBeNull()
    })
  })

  // ── agenda_area_focus_label (tenants.rules, migración 075) ─────────────────
  // Etiqueta visible del selector "Ver" de la agenda (paso 2/3 del pedido del
  // dueño). A diferencia de agenda_area_focus, SIEMPRE resuelve a un string —
  // no representa "sin ajuste", solo el texto a mostrar.
  describe('agenda_area_focus_label', () => {
    function mockRules(rules: Record<string, unknown>) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-abc' } },
        error: null,
      })
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { uses_native_calendar: false, rules },
            error: null,
          }),
        }),
      })
    }

    it('retorna la etiqueta configurada por la cuenta (ISADI, tras la migración 075)', async () => {
      mockRules({ agenda_area_focus: 'rehab', agenda_area_focus_label: 'Rehabilitación' })
      const response = await GET()
      const body = await response.json()
      expect(body.agenda_area_focus_label).toBe('Rehabilitación')
    })

    it('cae a "Rehabilitación" cuando la cuenta no configuró la etiqueta', async () => {
      mockRules({})
      const response = await GET()
      const body = await response.json()
      expect(body.agenda_area_focus_label).toBe('Rehabilitación')
    })

    it('cae a "Rehabilitación" cuando el valor no es un string no vacío', async () => {
      mockRules({ agenda_area_focus_label: '   ' })
      const response = await GET()
      const body = await response.json()
      expect(body.agenda_area_focus_label).toBe('Rehabilitación')
    })

    it('cae a "Rehabilitación" cuando el valor es de un tipo inválido', async () => {
      mockRules({ agenda_area_focus_label: 123 })
      const response = await GET()
      const body = await response.json()
      expect(body.agenda_area_focus_label).toBe('Rehabilitación')
    })

    it('respeta una etiqueta distinta a "Rehabilitación" si otra cuenta la configura así', async () => {
      mockRules({ agenda_area_focus_label: 'Kinesiología' })
      const response = await GET()
      const body = await response.json()
      expect(body.agenda_area_focus_label).toBe('Kinesiología')
    })
  })

  // ── Contrato de la respuesta ────────────────────────────────────────────────
  // La ruta lee `rules` entero de la DB (para poder leer `agenda_area_focus` /
  // `agenda_area_focus_label` / `reception_groups` / `reception_default_group`),
  // pero SOLO debe exponer esos campos públicos — nunca `rules` completo ni
  // ninguna de sus otras claves (ej. `absence_policy`). Este test falla si
  // alguien cambia la ruta para devolver `rules` tal cual (spread o campo
  // directo): `Object.keys` detecta cualquier clave extra, cosa que `toEqual`
  // por sí solo también haría, pero acá lo hacemos explícito e independiente
  // del resto de los valores.
  it('la respuesta expone SOLO uses_native_calendar, agenda_area_focus, agenda_area_focus_label, reception_groups y reception_default_group, aunque rules tenga otras claves', async () => {
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
              agenda_area_focus_label: 'Rehabilitación',
              reception_groups: { fisioterapia: { label: 'Fisioterapia', main_service_id: null } },
              reception_default_group: 'fisioterapia',
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
    expect(Object.keys(body).sort()).toEqual([
      'agenda_area_focus',
      'agenda_area_focus_label',
      'reception_default_group',
      'reception_groups',
      'uses_native_calendar',
    ])
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

import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
  mockLogAudit: vi.fn(),
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

vi.mock('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}))

import { GET, PATCH } from './route'

const TENANT_ID = '5298fcc5-15bf-494c-9655-b49d759cfef4'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

/**
 * Chain del UPDATE: .update(...).eq(...).select(...).single() → result
 */
function makeUpdateChain(result: { data: unknown; error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function setupAuth(role: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: `${role}-uuid-1` } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'some-token' } },
  })
  mockParseJwt.mockReturnValue({ app_role: role, tenant_id: TENANT_ID })
}

const CLINIC_CONFIG = {
  org_id: TENANT_ID,
  clinic_name: 'ISADI',
  agent_name: 'Asistente',
  prompt_rules: 'No agendar feriados',
  ia_config: {
    tone_base: 'informal',
    tone_length: 2,
    identity: 'Soy el asistente',
    constraints: '',
    features: {
      enable_new_appointment: true,
      enable_cancel: true,
      require_dni: false,
      require_obra_social: false,
    },
  },
  operations_config: { min_notice_hours: 2, future_window_days: 30 },
}

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/agente/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe('GET /api/agente/config', () => {
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

  it('retorna 403 si el app_role no está permitido', async () => {
    setupAuth('superintendente')

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Sin permiso')
  })

  it('retorna 403 si no hay claim de rol', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    mockParseJwt.mockReturnValue(null)

    const res = await GET()
    expect(res.status).toBe(403)
  })

  it.each(['admin', 'doctor', 'receptionist'])(
    'retorna 200 con { data } de v2_clinic_configs para rol %s',
    async (role) => {
      setupAuth(role)
      const chain = makeSelectSingleChain({ data: CLINIC_CONFIG, error: null })
      mockFrom.mockReturnValue(chain)

      const res = await GET()
      expect(res.status).toBe(200)
      const body = await res.json() as { data: typeof CLINIC_CONFIG }
      expect(body.data).toEqual(CLINIC_CONFIG)
      expect(mockFrom).toHaveBeenCalledWith('v2_clinic_configs')
    }
  )

  it('no usa .eq() en el SELECT (RLS filtra — AR14)', async () => {
    setupAuth('admin')
    const chain = makeSelectSingleChain({ data: CLINIC_CONFIG, error: null })
    mockFrom.mockReturnValue(chain)

    await GET()
    expect(chain).not.toHaveProperty('eq')
  })

  it('no lee de la tabla tenants', async () => {
    setupAuth('admin')
    mockFrom.mockReturnValue(makeSelectSingleChain({ data: CLINIC_CONFIG, error: null }))

    await GET()
    expect(mockFrom).not.toHaveBeenCalledWith('tenants')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAuth('admin')
    mockFrom.mockReturnValue(makeSelectSingleChain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al obtener configuración')
  })
})

// ── Tests PATCH ───────────────────────────────────────────────────────────────

describe('PATCH /api/agente/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await PATCH(makePatchRequest({ prompt_rules: 'x' }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor (sin permiso de escritura)', async () => {
    setupAuth('doctor')

    const res = await PATCH(makePatchRequest({ prompt_rules: 'x' }))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si prompt_rules supera 10.000 chars', async () => {
    setupAuth('admin')

    const longText = 'a'.repeat(10001)
    const res = await PATCH(makePatchRequest({ prompt_rules: longText }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; details: unknown }
    expect(body.error).toBe('Configuración inválida')
    expect(body.details).toBeDefined()
  })

  it('retorna 400 si min_notice_hours es negativo', async () => {
    setupAuth('admin')

    const res = await PATCH(
      makePatchRequest({ operations_config: { min_notice_hours: -1 } })
    )
    expect(res.status).toBe(400)
  })

  it.each(['admin', 'receptionist'])(
    'retorna 200 y llama logAudit(config_agent_updated) para rol %s con body válido',
    async (role) => {
      setupAuth(role)
      mockLogAudit.mockResolvedValue(undefined)
      const updateChain = makeUpdateChain({ data: CLINIC_CONFIG, error: null })
      mockFrom.mockReturnValue(updateChain)

      const res = await PATCH(makePatchRequest({ prompt_rules: 'Nuevas reglas' }))
      expect(res.status).toBe(200)

      const body = await res.json() as { data: typeof CLINIC_CONFIG }
      expect(body.data).toEqual(CLINIC_CONFIG)

      expect(updateChain.update).toHaveBeenCalledWith({ prompt_rules: 'Nuevas reglas' })
      expect(updateChain.eq).toHaveBeenCalledWith('org_id', TENANT_ID)
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'config_agent_updated',
          entity_type: 'config',
          entity_id: TENANT_ID,
        })
      )
    }
  )

  it('PATCH parcial sólo de prompt_rules NO incluye agent_name/ia_config/operations_config en el update', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)
    const updateChain = makeUpdateChain({ data: CLINIC_CONFIG, error: null })
    mockFrom.mockReturnValue(updateChain)

    await PATCH(makePatchRequest({ prompt_rules: 'solo reglas' }))

    expect(updateChain.update).toHaveBeenCalledWith({ prompt_rules: 'solo reglas' })
    const payload = updateChain.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('agent_name')
    expect(payload).not.toHaveProperty('ia_config')
    expect(payload).not.toHaveProperty('operations_config')
  })

  it('merge de ia_config: un PATCH de tone_base NO pisa features/identity existentes (AC4)', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)

    const existingIaConfig = {
      tone_base: 'formal',
      identity: 'Identidad previa',
      features: { enable_cancel: true, require_dni: true },
    }
    const selectChain = makeSelectSingleChain({ data: { ia_config: existingIaConfig }, error: null })
    const updateChain = makeUpdateChain({ data: CLINIC_CONFIG, error: null })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain // SELECT ia_config actual
      return updateChain // UPDATE
    })

    await PATCH(makePatchRequest({ ia_config: { tone_base: 'informal' } }))

    const payload = updateChain.update.mock.calls[0][0] as { ia_config: Record<string, unknown> }
    expect(payload.ia_config).toEqual({
      tone_base: 'informal',
      identity: 'Identidad previa',
      features: { enable_cancel: true, require_dni: true },
    })
  })

  it('no escribe a la tabla tenants', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)
    mockFrom.mockReturnValue(makeUpdateChain({ data: CLINIC_CONFIG, error: null }))

    await PATCH(makePatchRequest({ agent_name: 'Nuevo' }))
    expect(mockFrom).not.toHaveBeenCalledWith('tenants')
  })

  it('retorna 400 si el body no trae campos editables', async () => {
    setupAuth('admin')

    const res = await PATCH(makePatchRequest({}))
    expect(res.status).toBe(400)
  })

  it('retorna 500 si el update falla', async () => {
    setupAuth('admin')
    mockFrom.mockReturnValue(makeUpdateChain({ data: null, error: { message: 'DB update error' } }))

    const res = await PATCH(makePatchRequest({ agent_name: 'X' }))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al guardar la configuración')
  })

  // ── booking_windows (pedido ISADI 2026-07-14) ───────────────────────────────

  it('persiste booking_windows dentro de operations_config', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)
    const configWithWindows = {
      ...CLINIC_CONFIG,
      operations_config: {
        min_notice_hours: 2,
        future_window_days: 30,
        booking_windows: [
          { start: '08:00', end: '12:00' },
          { start: '15:00', end: '18:00' },
        ],
      },
    }
    const updateChain = makeUpdateChain({ data: configWithWindows, error: null })
    mockFrom.mockReturnValue(updateChain)

    const res = await PATCH(
      makePatchRequest({
        operations_config: {
          min_notice_hours: 2,
          future_window_days: 30,
          booking_windows: [
            { start: '08:00', end: '12:00' },
            { start: '15:00', end: '18:00' },
          ],
        },
      }),
    )

    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({
      operations_config: {
        min_notice_hours: 2,
        future_window_days: 30,
        booking_windows: [
          { start: '08:00', end: '12:00' },
          { start: '15:00', end: '18:00' },
        ],
      },
    })
    const body = await res.json() as { data: typeof configWithWindows }
    expect(body.data.operations_config.booking_windows).toEqual([
      { start: '08:00', end: '12:00' },
      { start: '15:00', end: '18:00' },
    ])
  })

  it('acepta booking_windows = null (sin restricción, comportamiento default)', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)
    const updateChain = makeUpdateChain({ data: CLINIC_CONFIG, error: null })
    mockFrom.mockReturnValue(updateChain)

    const res = await PATCH(
      makePatchRequest({ operations_config: { booking_windows: null } }),
    )

    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({
      operations_config: { booking_windows: null },
    })
  })

  it('acepta booking_windows = [] (sin restricción)', async () => {
    setupAuth('admin')
    mockLogAudit.mockResolvedValue(undefined)
    const updateChain = makeUpdateChain({ data: CLINIC_CONFIG, error: null })
    mockFrom.mockReturnValue(updateChain)

    const res = await PATCH(
      makePatchRequest({ operations_config: { booking_windows: [] } }),
    )

    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({
      operations_config: { booking_windows: [] },
    })
  })

  it('retorna 400 si una franja tiene formato de hora inválido', async () => {
    setupAuth('admin')

    const res = await PATCH(
      makePatchRequest({
        operations_config: { booking_windows: [{ start: '8:00', end: '12:00' }] },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('retorna 400 si start >= end en una franja', async () => {
    setupAuth('admin')

    const res = await PATCH(
      makePatchRequest({
        operations_config: { booking_windows: [{ start: '12:00', end: '08:00' }] },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('retorna 400 si dos franjas se solapan', async () => {
    setupAuth('admin')

    const res = await PATCH(
      makePatchRequest({
        operations_config: {
          booking_windows: [
            { start: '08:00', end: '12:00' },
            { start: '11:00', end: '18:00' },
          ],
        },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('retorna 400 si hay más de 4 franjas', async () => {
    setupAuth('admin')

    const res = await PATCH(
      makePatchRequest({
        operations_config: {
          booking_windows: [
            { start: '00:00', end: '00:30' },
            { start: '01:00', end: '01:30' },
            { start: '02:00', end: '02:30' },
            { start: '03:00', end: '03:30' },
            { start: '04:00', end: '04:30' },
          ],
        },
      }),
    )
    expect(res.status).toBe(400)
  })
})

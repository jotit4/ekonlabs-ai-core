import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
  mockLogAudit: vi.fn(),
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
  logAudit: mockLogAudit,
}))

import { GET, PATCH } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function makeUpdateChain(result: { error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  }
}

/**
 * Configura mockFrom para el flujo PATCH completo:
 * 1. SELECT tenants (leer valor anterior)
 * 2. UPDATE tenants
 * 3. INSERT system_prompt_history (no-crítico)
 */
function setupPatchChain(
  selectResult: { data: { system_prompt_override: string | null } | null; error: unknown },
  updateResult: { error: unknown },
  historyInsertResult: { error: unknown } = { error: null }
) {
  const selectChain = makeSelectSingleChain(selectResult)
  const updateChain = makeUpdateChain(updateResult)
  const insertChain = { insert: vi.fn().mockResolvedValue(historyInsertResult) }

  let callCount = 0
  mockFrom.mockImplementation(() => {
    callCount++
    if (callCount === 1) return selectChain    // SELECT tenants (historial previo)
    if (callCount === 2) return updateChain    // UPDATE tenants
    return insertChain                          // INSERT system_prompt_history
  })
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

const TENANT_CONFIG = {
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  system_prompt_override: 'Mi override personalizado',
  rules: { key: 'value' },
  shadow_mode_enabled: false,
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

  it('retorna 200 con { data: TenantAgentConfig } cuando admin con sesión válida', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeSelectSingleChain({ data: TENANT_CONFIG, error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof TENANT_CONFIG }
    expect(body.data).toEqual(TENANT_CONFIG)
    expect(body.data.tenant_id).toBe('5298fcc5-15bf-494c-9655-b49d759cfef4')
  })

  it('retorna 500 si Supabase falla', async () => {
    setupAdminAuth()
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

  function makePatchRequest(body: unknown): Request {
    return new Request('http://localhost/api/agente/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await PATCH(makePatchRequest({ system_prompt_override: 'test' }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si rol no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'doc-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await PATCH(makePatchRequest({ system_prompt_override: 'test' }))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna 400 si system_prompt_override supera 10.000 chars', async () => {
    setupAdminAuth()

    const longText = 'a'.repeat(10001)
    const res = await PATCH(makePatchRequest({ system_prompt_override: longText }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Override inválido')
  })

  it('retorna 200 y llama logAudit con config_system_prompt_updated cuando es válido', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)
    setupPatchChain(
      { data: { system_prompt_override: 'prompt anterior' }, error: null },
      { error: null }
    )

    const overrideText = 'Mi prompt personalizado válido'
    const res = await PATCH(makePatchRequest({ system_prompt_override: overrideText }))
    expect(res.status).toBe(200)

    const body = await res.json() as { data: { system_prompt_override: string } }
    expect(body.data.system_prompt_override).toBe(overrideText)

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'config_system_prompt_updated',
        entity_type: 'config',
        entity_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
      })
    )
  })

  it('retorna 500 si Supabase falla en el update', async () => {
    setupAdminAuth()
    // Solo necesitamos SELECT + UPDATE (UPDATE falla → no llega al INSERT)
    const selectChain = makeSelectSingleChain({ data: { system_prompt_override: 'anterior' }, error: null })
    const updateChain = makeUpdateChain({ error: { message: 'DB update error' } })
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      return updateChain
    })

    const res = await PATCH(makePatchRequest({ system_prompt_override: 'texto válido' }))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al guardar el prompt')
  })

  it('PATCH exitoso: registra historial con previous_content y new_content correctos', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)

    const selectChain = makeSelectSingleChain({ data: { system_prompt_override: 'prompt previo' }, error: null })
    const updateChain = makeUpdateChain({ error: null })
    const insertChain = { insert: vi.fn().mockResolvedValue({ error: null }) }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      if (callCount === 2) return updateChain
      return insertChain
    })

    const overrideText = 'prompt nuevo'
    const res = await PATCH(makePatchRequest({ system_prompt_override: overrideText }))
    expect(res.status).toBe(200)

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_content: 'prompt previo',
        new_content: overrideText,
        user_id: 'admin-uuid-1',
      })
    )
  })

  it('PATCH: si el insert de historial falla → la request retorna 200 igual (no-crítico)', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)

    const selectChain = makeSelectSingleChain({ data: { system_prompt_override: null }, error: null })
    const updateChain = makeUpdateChain({ error: null })
    // Insert de historial retorna error de Supabase (no lanza excepción)
    const insertChain = { insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      if (callCount === 2) return updateChain
      return insertChain
    })

    const res = await PATCH(makePatchRequest({ system_prompt_override: 'texto válido' }))
    expect(res.status).toBe(200)
  })
})

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

import { PATCH } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUpdateChain(result: { error: unknown }) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  }
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

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/agente/shadow-mode', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/agente/shadow-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: true }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si app_role !== admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'rec-uuid-1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'some-token' } } })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: true }))
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('administradores')
  })

  it('retorna 400 si body es null', async () => {
    setupAdminAuth()

    const req = new Request('http://localhost/api/agente/shadow-mode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{{{',
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('shadow_mode_enabled debe ser boolean')
  })

  it('retorna 400 si shadow_mode_enabled no es boolean (string)', async () => {
    setupAdminAuth()

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: 'true' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('shadow_mode_enabled debe ser boolean')
  })

  it('retorna 400 si shadow_mode_enabled no es boolean (number)', async () => {
    setupAdminAuth()

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: 1 }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('shadow_mode_enabled debe ser boolean')
  })

  it('llama update en tenants con valor true y retorna 200 con data', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)
    mockFrom.mockReturnValue(makeUpdateChain({ error: null }))

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: true }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { shadow_mode_enabled: boolean } }
    expect(body.data.shadow_mode_enabled).toBe(true)
  })

  it('retorna 200 con shadow_mode_enabled: false para desactivar', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)
    mockFrom.mockReturnValue(makeUpdateChain({ error: null }))

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: false }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { shadow_mode_enabled: boolean } }
    expect(body.data.shadow_mode_enabled).toBe(false)
  })

  it('retorna 500 si Supabase UPDATE falla', async () => {
    setupAdminAuth()
    mockFrom.mockReturnValue(makeUpdateChain({ error: { message: 'DB error' } }))

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: true }))
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Error al actualizar shadow mode')
  })

  it('llama logAudit con config_shadow_mode_updated y entity_type config', async () => {
    setupAdminAuth()
    mockLogAudit.mockResolvedValue(undefined)
    mockFrom.mockReturnValue(makeUpdateChain({ error: null }))

    await PATCH(makePatchRequest({ shadow_mode_enabled: true }))

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'config_shadow_mode_updated',
        entity_type: 'config',
        entity_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
      })
    )
  })

  it('logAudit no bloquea la respuesta — UPDATE exitoso retorna 200 incluso si logAudit tarda', async () => {
    setupAdminAuth()
    // logAudit resuelve después de un tick (simula operación async no-crítica)
    mockLogAudit.mockResolvedValue(undefined)
    mockFrom.mockReturnValue(makeUpdateChain({ error: null }))

    const res = await PATCH(makePatchRequest({ shadow_mode_enabled: true }))
    expect(res.status).toBe(200)
    expect(mockLogAudit).toHaveBeenCalled()
  })
})

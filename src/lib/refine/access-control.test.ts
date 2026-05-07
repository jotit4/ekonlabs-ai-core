import { vi, describe, it, expect, beforeEach } from 'vitest'
import { accessControlProvider } from './access-control'

function makeJwt(role: string) {
  const encoded = btoa(JSON.stringify({ role, tenant_id: 'tenant-1' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const mockGetSession = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}))

describe('accessControlProvider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('receptionist puede listar agenda', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    const result = await accessControlProvider.can({ resource: 'agenda', action: 'list' })
    expect(result.can).toBe(true)
  })

  it('receptionist puede listar conversaciones', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    const result = await accessControlProvider.can({ resource: 'conversaciones', action: 'list' })
    expect(result.can).toBe(true)
  })

  it('receptionist no puede acceder a configuracion', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    const result = await accessControlProvider.can({ resource: 'configuracion', action: 'list' })
    expect(result.can).toBe(false)
  })

  it('doctor puede editar pacientes', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    const result = await accessControlProvider.can({ resource: 'pacientes', action: 'edit' })
    expect(result.can).toBe(true)
  })

  it('doctor no puede listar conversaciones', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    const result = await accessControlProvider.can({ resource: 'conversaciones', action: 'list' })
    expect(result.can).toBe(false)
  })

  it('admin puede hacer todo en usuarios', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    const result = await accessControlProvider.can({ resource: 'usuarios', action: 'delete' })
    expect(result.can).toBe(true)
  })

  it('admin puede acceder a metricas', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    const result = await accessControlProvider.can({ resource: 'metricas', action: 'list' })
    expect(result.can).toBe(true)
  })

  it('JWT válido sin claim role → can false con razón "desconocido"', async () => {
    const tokenWithoutRole =
      'h.' +
      btoa(JSON.stringify({ tenant_id: 'tenant-1' }))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_') +
      '.sig'
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: tokenWithoutRole } },
    })
    const result = await accessControlProvider.can({ resource: 'agenda', action: 'list' })
    expect(result.can).toBe(false)
    expect(result.reason).toMatch(/desconocido/i)
  })

  it('sin sesión → can false', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const result = await accessControlProvider.can({ resource: 'agenda', action: 'list' })
    expect(result.can).toBe(false)
  })

  it('sin resource → can true (recurso no especificado)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    const result = await accessControlProvider.can({ action: 'list' })
    expect(result.can).toBe(true)
  })
})

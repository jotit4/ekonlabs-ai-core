import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

// La página resuelve el rol con `getAuthClaims()`, que internamente usa
// `supabase.auth.getClaims()`. El mock anterior de este archivo solo exponía
// `getUser`/`getSession`: al no existir `getClaims`, `getAuthClaims` caía a su
// camino de compatibilidad, que a propósito NO lee el rol. Con eso `auth.role`
// era siempre `undefined` y los cuatro tests pasaban (o fallaban) por el
// motivo equivocado: el de admin fallaba, y los de recepción y profesional
// pasaban sin ejercitar el control de rol. Se mockea `getAuthClaims` directo,
// como hacen los tests de `src/app/api/media/*`.
const { mockGetAuthClaims } = vi.hoisted(() => ({
  mockGetAuthClaims: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/auth/claims', () => ({
  getAuthClaims: mockGetAuthClaims,
}))

vi.mock('@/components/configuracion/ServicesView', () => ({
  ServicesView: () => <div data-testid="services-view" />,
}))

import ServiciosPage from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function authComoRol(role: string) {
  return {
    userId: 'user-1',
    role,
    tenantId: 'tenant-1',
    claims: { sub: 'user-1', app_role: role, tenant_id: 'tenant-1' },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServiciosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetAuthClaims.mockResolvedValue(null)

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol es receptionist', async () => {
    mockGetAuthClaims.mockResolvedValue(authComoRol('receptionist'))

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /agenda si el rol es doctor', async () => {
    mockGetAuthClaims.mockResolvedValue(authComoRol('doctor'))

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /agenda si la sesión no trae rol', async () => {
    mockGetAuthClaims.mockResolvedValue({ userId: 'user-1', role: undefined, tenantId: 'tenant-1', claims: {} })

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza ServicesView cuando el rol es admin', async () => {
    mockGetAuthClaims.mockResolvedValue(authComoRol('admin'))

    const element = await ServiciosPage()
    render(element)

    expect(screen.getByTestId('services-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument()
  })
})

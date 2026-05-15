import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
    })
  ),
}))

vi.mock('@/components/configuracion/ServicesView', () => ({
  ServicesView: () => <div data-testid="services-view" />,
}))

import ServiciosPage from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { app_role: 'admin', tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServiciosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'receptionist', tenant_id: 'tenant-1' }),
        },
      },
    })

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /agenda si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'doctor', tenant_id: 'tenant-1' }),
        },
      },
    })

    await expect(ServiciosPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza ServicesView cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' }),
        },
      },
    })

    const element = await ServiciosPage()
    render(element)

    expect(screen.getByTestId('services-view')).toBeInTheDocument()
    expect(screen.getByText('Servicios del agente')).toBeInTheDocument()
  })
})

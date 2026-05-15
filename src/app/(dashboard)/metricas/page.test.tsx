import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockParseJwt: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('@/components/metricas/MetricasClientWrapper', () => ({
  MetricasClientWrapper: () => <div data-testid="metricas-client-wrapper" />,
}))

import MetricasPage from './page'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MetricasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expect(MetricasPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol no es admin (receptionist)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'receptionist', tenant_id: 'tenant-1' }),
        },
      },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    await expect(MetricasPage()).rejects.toThrow('REDIRECT:/agenda')
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
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    await expect(MetricasPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza MetricasClientWrapper cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }),
        },
      },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

    const element = await MetricasPage()
    render(element)

    expect(screen.getByTestId('metricas-client-wrapper')).toBeInTheDocument()
    expect(screen.getByText('Métricas')).toBeInTheDocument()
  })
})

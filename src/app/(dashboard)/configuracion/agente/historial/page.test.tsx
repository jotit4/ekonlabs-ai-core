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

vi.mock('@/components/configuracion/PromptHistoryView', () => ({
  PromptHistoryView: () => <div data-testid="prompt-history-view" />,
}))

import HistorialPage from './page'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { app_role: 'admin', tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HistorialPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expect(HistorialPage()).rejects.toThrow('REDIRECT:/login')
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

    await expect(HistorialPage()).rejects.toThrow('REDIRECT:/agenda')
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

    await expect(HistorialPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza PromptHistoryView cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' }),
        },
      },
    })

    const element = await HistorialPage()
    render(element)

    expect(screen.getByTestId('prompt-history-view')).toBeInTheDocument()
    expect(screen.getByText('Historial de cambios')).toBeInTheDocument()
    expect(screen.getByText(/Configuración \/ Agente IA/)).toBeInTheDocument()
  })
})

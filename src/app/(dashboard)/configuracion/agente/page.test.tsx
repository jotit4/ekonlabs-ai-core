import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
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
      from: mockFrom,
    })
  ),
}))

vi.mock('@/components/configuracion/AgentPromptEditor', () => ({
  AgentPromptEditor: () => <div data-testid="agent-prompt-editor" />,
}))

vi.mock('@/components/configuracion/ShadowModeToggle', () => ({
  ShadowModeToggle: ({ initialValue }: { initialValue: boolean }) => (
    <div data-testid="shadow-mode-toggle" data-initial-value={String(initialValue)} />
  ),
}))

import AgentePage from './page'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { app_role: 'admin', tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function makeSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

describe('AgentePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Por defecto: from() retorna shadow_mode_enabled: false
    mockFrom.mockReturnValue(makeSelectSingleChain({ data: { shadow_mode_enabled: false }, error: null }))
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expect(AgentePage()).rejects.toThrow('REDIRECT:/login')
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

    await expect(AgentePage()).rejects.toThrow('REDIRECT:/agenda')
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

    await expect(AgentePage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza AgentPromptEditor cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' }),
        },
      },
    })

    const element = await AgentePage()
    render(element)

    expect(screen.getByTestId('agent-prompt-editor')).toBeInTheDocument()
    expect(screen.getByText('Agente IA')).toBeInTheDocument()
  })
})

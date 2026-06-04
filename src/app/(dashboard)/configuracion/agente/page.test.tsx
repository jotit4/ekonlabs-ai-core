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

vi.mock('@/components/configuracion/KnowledgeBaseManager', () => ({
  KnowledgeBaseManager: ({ canEdit }: { canEdit?: boolean }) => (
    <div data-testid="knowledge-base-manager" data-can-edit={String(canEdit)} />
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

  function setAuth(role: string | null) {
    if (role === null) {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      mockGetSession.mockResolvedValue({ data: { session: null } })
      return
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt({ app_role: role, tenant_id: 'tenant-1' }) } },
    })
  }

  it('redirige a /login si no hay usuario autenticado', async () => {
    setAuth(null)
    await expect(AgentePage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol no está contemplado', async () => {
    setAuth('superintendente')
    await expect(AgentePage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it.each(['admin', 'doctor', 'receptionist'])(
    'NO redirige y renderiza AgentPromptEditor para rol %s',
    async (role) => {
      setAuth(role)
      const element = await AgentePage()
      render(element)

      expect(screen.getByTestId('agent-prompt-editor')).toBeInTheDocument()
      expect(screen.getByText('Agente IA')).toBeInTheDocument()
    }
  )

  it('renderiza ShadowModeToggle SOLO para admin', async () => {
    setAuth('admin')
    const element = await AgentePage()
    render(element)
    expect(screen.getByTestId('shadow-mode-toggle')).toBeInTheDocument()
  })

  it('NO renderiza ShadowModeToggle para receptionist', async () => {
    setAuth('receptionist')
    const element = await AgentePage()
    render(element)
    expect(screen.queryByTestId('shadow-mode-toggle')).not.toBeInTheDocument()
  })

  it('NO renderiza ShadowModeToggle para doctor', async () => {
    setAuth('doctor')
    const element = await AgentePage()
    render(element)
    expect(screen.queryByTestId('shadow-mode-toggle')).not.toBeInTheDocument()
  })
})

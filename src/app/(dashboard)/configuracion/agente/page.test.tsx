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

// AgentPromptEditor ahora concentra el gating de ShadowModeToggle y
// KnowledgeBaseManager internamente. El mock expone los props clave para
// que las pruebas de la page puedan verificar que se pasen correctamente.
vi.mock('@/components/configuracion/AgentPromptEditor', () => ({
  AgentPromptEditor: ({
    isAdmin,
    initialShadowMode,
    canEdit,
  }: {
    isAdmin?: boolean
    initialShadowMode?: boolean
    canEdit?: boolean
  }) => (
    <div
      data-testid="agent-prompt-editor"
      data-is-admin={String(isAdmin)}
      data-initial-shadow-mode={String(initialShadowMode)}
      data-can-edit={String(canEdit)}
    />
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

function makeSelectSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Por defecto: from() retorna shadow_mode_enabled: false
    mockFrom.mockReturnValue(
      makeSelectSingleChain({ data: { shadow_mode_enabled: false }, error: null }),
    )
  })

  function setAuth(role: string | null) {
    if (role === null) {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      mockGetSession.mockResolvedValue({ data: { session: null } })
      return
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: { access_token: makeJwt({ app_role: role, tenant_id: 'tenant-1' }) },
      },
    })
  }

  // ── Gating de roles ────────────────────────────────────────────────────────

  it('redirige a /login si no hay usuario autenticado', async () => {
    setAuth(null)
    await expect(AgentePage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol no está contemplado', async () => {
    setAuth('superintendente')
    await expect(AgentePage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /mi-jornada si el rol es doctor', async () => {
    setAuth('doctor')
    await expect(AgentePage()).rejects.toThrow('REDIRECT:/mi-jornada')
  })

  it.each(['admin', 'receptionist'])(
    'NO redirige y renderiza AgentPromptEditor para rol %s',
    async (role) => {
      setAuth(role)
      const element = await AgentePage()
      render(element)

      expect(screen.getByTestId('agent-prompt-editor')).toBeInTheDocument()
      expect(screen.getByText('Agente IA')).toBeInTheDocument()
    },
  )

  // ── Props pasados a AgentPromptEditor ─────────────────────────────────────

  it('pasa isAdmin=true a AgentPromptEditor para rol admin', async () => {
    mockFrom.mockReturnValue(
      makeSelectSingleChain({ data: { shadow_mode_enabled: true }, error: null }),
    )
    setAuth('admin')
    const element = await AgentePage()
    render(element)

    const editor = screen.getByTestId('agent-prompt-editor')
    expect(editor).toHaveAttribute('data-is-admin', 'true')
    expect(editor).toHaveAttribute('data-initial-shadow-mode', 'true')
    expect(editor).toHaveAttribute('data-can-edit', 'true')
  })

  it('pasa isAdmin=false a AgentPromptEditor para rol receptionist', async () => {
    setAuth('receptionist')
    const element = await AgentePage()
    render(element)

    const editor = screen.getByTestId('agent-prompt-editor')
    expect(editor).toHaveAttribute('data-is-admin', 'false')
    expect(editor).toHaveAttribute('data-can-edit', 'true')
  })

  it('initialShadowMode refleja el valor de la DB para admin', async () => {
    mockFrom.mockReturnValue(
      makeSelectSingleChain({ data: { shadow_mode_enabled: true }, error: null }),
    )
    setAuth('admin')
    const element = await AgentePage()
    render(element)

    expect(screen.getByTestId('agent-prompt-editor')).toHaveAttribute(
      'data-initial-shadow-mode',
      'true',
    )
  })

  it('initialShadowMode es false para receptionist (no consulta DB)', async () => {
    setAuth('receptionist')
    const element = await AgentePage()
    render(element)

    // Para receptionist no se consulta DB, initialShadowMode es false por defecto
    expect(screen.getByTestId('agent-prompt-editor')).toHaveAttribute(
      'data-initial-shadow-mode',
      'false',
    )
    // Confirmar que from() NO fue llamado (solo admin consulta shadow_mode)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

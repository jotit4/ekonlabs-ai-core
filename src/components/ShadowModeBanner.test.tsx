import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-agent-config', () => ({
  useAgentConfig: vi.fn(),
}))

import { useAgentConfig } from '@/hooks/use-agent-config'
import { ShadowModeBanner } from './ShadowModeBanner'

const mockUseAgentConfig = vi.mocked(useAgentConfig)

function setupMock({
  shadowModeEnabled,
  isPending = false,
  isError = false,
}: {
  shadowModeEnabled: boolean
  isPending?: boolean
  isError?: boolean
}) {
  mockUseAgentConfig.mockReturnValue({
    config: isPending || isError
      ? null
      : {
          tenant_id: 'test-tenant',
          shadow_mode_enabled: shadowModeEnabled,
          system_prompt_override: null,
          rules: {},
        },
    isPending,
    isError,
    refetch: vi.fn(),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShadowModeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no renderiza nada cuando shadow_mode_enabled: false', () => {
    setupMock({ shadowModeEnabled: false })
    const { container } = render(<ShadowModeBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no renderiza nada cuando isPending: true', () => {
    setupMock({ shadowModeEnabled: true, isPending: true })
    const { container } = render(<ShadowModeBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no renderiza nada cuando isError: true', () => {
    setupMock({ shadowModeEnabled: true, isError: true })
    const { container } = render(<ShadowModeBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renderiza banner cuando shadow_mode_enabled: true', () => {
    setupMock({ shadowModeEnabled: true })
    render(<ShadowModeBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('banner tiene role="status"', () => {
    setupMock({ shadowModeEnabled: true })
    render(<ShadowModeBanner />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('role', 'status')
  })

  it('banner contiene texto "Shadow mode activo"', () => {
    setupMock({ shadowModeEnabled: true })
    render(<ShadowModeBanner />)
    expect(screen.getByText(/Shadow mode activo/)).toBeInTheDocument()
  })
})

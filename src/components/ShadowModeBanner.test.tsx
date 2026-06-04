import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-shadow-mode', () => ({
  useShadowMode: vi.fn(),
}))

import { useShadowMode } from '@/hooks/use-shadow-mode'
import { ShadowModeBanner } from './ShadowModeBanner'

const mockUseShadowMode = vi.mocked(useShadowMode)

function setupMock({
  shadowModeEnabled,
  isPending = false,
  isError = false,
}: {
  shadowModeEnabled: boolean
  isPending?: boolean
  isError?: boolean
}) {
  mockUseShadowMode.mockReturnValue({
    shadowModeEnabled: isPending || isError ? false : shadowModeEnabled,
    isPending,
    isError,
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

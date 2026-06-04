import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToggle = vi.fn()

vi.mock('@/hooks/use-shadow-mode', () => ({
  useShadowMode: vi.fn(),
}))

vi.mock('@/hooks/use-toggle-shadow-mode', () => ({
  useToggleShadowMode: vi.fn(),
}))

import { useShadowMode } from '@/hooks/use-shadow-mode'
import { useToggleShadowMode } from '@/hooks/use-toggle-shadow-mode'
import { ShadowModeToggle } from './ShadowModeToggle'

const mockUseShadowMode = vi.mocked(useShadowMode)
const mockUseToggleShadowMode = vi.mocked(useToggleShadowMode)

function setupMocks(shadowModeEnabled: boolean, isPending = false) {
  mockUseShadowMode.mockReturnValue({
    shadowModeEnabled,
    isPending: false,
    isError: false,
  })
  mockUseToggleShadowMode.mockReturnValue({
    toggle: mockToggle,
    isPending,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShadowModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('toggle con aria-checked="false" cuando shadow mode está desactivado', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('toggle con aria-checked="true" cuando shadow mode está activado', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('muestra texto "El agente NO confirma turnos automáticamente" cuando activo', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    expect(
      screen.getByText('El agente NO confirma turnos automáticamente')
    ).toBeInTheDocument()
  })

  it('muestra texto "El agente confirma turnos automáticamente" cuando inactivo', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(
      screen.getByText('El agente confirma turnos automáticamente')
    ).toBeInTheDocument()
  })

  it('muestra aviso role="status" cuando shadow mode está activo', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    const statusEl = screen.getByRole('status')
    expect(statusEl).toBeInTheDocument()
    expect(statusEl).toHaveTextContent('Agendamiento automático bloqueado')
  })

  it('NO muestra aviso cuando shadow mode está inactivo', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('click en toggle llama toggle con valor invertido (false → true)', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    expect(mockToggle).toHaveBeenCalledWith(true)
  })

  it('click en toggle llama toggle con valor invertido (true → false)', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    expect(mockToggle).toHaveBeenCalledWith(false)
  })

  it('toggle tiene opacity-50 cuando isPending: true', () => {
    setupMocks(false, true)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    expect(toggle.className).toContain('opacity-50')
  })

  it('click en toggle NO llama toggle cuando isPending: true', () => {
    setupMocks(false, true)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    expect(mockToggle).not.toHaveBeenCalled()
  })

  it('Enter activa el toggle', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    fireEvent.keyDown(toggle, { key: 'Enter' })

    expect(mockToggle).toHaveBeenCalledWith(true)
  })

  it('Espacio activa el toggle', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    const toggle = screen.getByRole('switch')
    fireEvent.keyDown(toggle, { key: ' ' })

    expect(mockToggle).toHaveBeenCalledWith(true)
  })
})

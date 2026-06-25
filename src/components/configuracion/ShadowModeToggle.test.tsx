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

describe('ShadowModeToggle — Confirmación de turnos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── NO aparece "Shadow Mode" ───────────────────────────────────────────────

  it('NO muestra el texto "Shadow Mode" en ninguna variante', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.queryByText(/shadow mode/i)).not.toBeInTheDocument()
  })

  it('muestra el título "Confirmación de turnos"', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.getByText('Confirmación de turnos')).toBeInTheDocument()
  })

  // ── Selección de opciones ──────────────────────────────────────────────────

  it('selecciona "Automática" cuando shadow_mode=false', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.getByRole('radio', { name: /Automática/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Manual/i })).not.toBeChecked()
  })

  it('selecciona "Manual" cuando shadow_mode=true', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    expect(screen.getByRole('radio', { name: /Manual/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Automática/i })).not.toBeChecked()
  })

  it('muestra descripción de "Automática" que incluye confirma los turnos al instante', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.getByText(/confirma los turnos al instante/i)).toBeInTheDocument()
  })

  it('muestra descripción de "Manual" que incluye equipo lo confirma', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    expect(screen.getByText(/equipo lo confirma/i)).toBeInTheDocument()
  })

  // ── Aviso de estado ────────────────────────────────────────────────────────

  it('muestra aviso role="status" cuando confirmación manual está activa', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    const statusEl = screen.getByRole('status')
    expect(statusEl).toBeInTheDocument()
    expect(statusEl).toHaveTextContent(/pendientes de confirmación/i)
  })

  it('NO muestra aviso cuando confirmación automática está activa', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // ── Interacción ───────────────────────────────────────────────────────────

  it('click en "Manual" llama toggle con true', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    fireEvent.click(screen.getByRole('radio', { name: /Manual/i }))

    expect(mockToggle).toHaveBeenCalledWith(true)
  })

  it('click en "Automática" llama toggle con false', () => {
    setupMocks(true)
    render(<ShadowModeToggle initialValue={true} />)

    fireEvent.click(screen.getByRole('radio', { name: /Automática/i }))

    expect(mockToggle).toHaveBeenCalledWith(false)
  })

  // ── Estado pendiente ───────────────────────────────────────────────────────

  it('los radios están deshabilitados cuando isPending: true', () => {
    setupMocks(false, true)
    render(<ShadowModeToggle initialValue={false} />)

    expect(screen.getByRole('radio', { name: /Automática/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Manual/i })).toBeDisabled()
  })

  it('click en "Manual" NO llama toggle cuando isPending: true', () => {
    setupMocks(false, true)
    render(<ShadowModeToggle initialValue={false} />)

    fireEvent.click(screen.getByRole('radio', { name: /Manual/i }))

    expect(mockToggle).not.toHaveBeenCalled()
  })

  // ── Radiogroup accesible ──────────────────────────────────────────────────

  it('el radiogroup tiene aria-label de confirmación de turnos', () => {
    setupMocks(false)
    render(<ShadowModeToggle initialValue={false} />)

    expect(
      screen.getByRole('radiogroup', { name: /confirmación de turnos/i }),
    ).toBeInTheDocument()
  })

  // ── Valor inicial (SSR optimista) ─────────────────────────────────────────

  it('usa initialValue=true mientras useShadowMode está cargando', () => {
    mockUseShadowMode.mockReturnValue({
      shadowModeEnabled: false,
      isPending: true,
      isError: false,
    })
    mockUseToggleShadowMode.mockReturnValue({ toggle: mockToggle, isPending: false })

    render(<ShadowModeToggle initialValue={true} />)

    // isPending=true en useShadowMode → usa initialValue=true → "Manual" checkeado
    expect(screen.getByRole('radio', { name: /Manual/i })).toBeChecked()
  })
})

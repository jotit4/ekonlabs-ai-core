import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CancelConfirmInline } from './CancelConfirmInline'

describe('CancelConfirmInline', () => {
  const mockOnConfirm = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el nombre del paciente en la pregunta de confirmación', () => {
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.getByText(/¿Cancelar el turno de Ana García\?/)).toBeInTheDocument()
  })

  it('muestra la advertencia de que la acción no se puede deshacer', () => {
    render(
      <CancelConfirmInline
        patientName="Juan López"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.getByText(/Esta acción no se puede deshacer/)).toBeInTheDocument()
  })

  it('llama onConfirm al hacer click en "Sí, cancelar turno"', async () => {
    const user = userEvent.setup()
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /sí, cancelar turno/i }))
    expect(mockOnConfirm).toHaveBeenCalledOnce()
  })

  it('llama onClose al hacer click en "No, volver"', async () => {
    const user = userEvent.setup()
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /no, volver/i }))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('deshabilita los botones y muestra "Cancelando..." mientras isLoading=true', () => {
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={true}
        error={null}
      />,
    )
    expect(screen.getByRole('button', { name: /cancelando\.\.\./i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /no, volver/i })).toBeDisabled()
  })

  it('muestra el error con role="alert" cuando hay un mensaje de error', () => {
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error="No se pudo cancelar el turno"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('No se pudo cancelar el turno')
  })

  it('NO muestra alerta cuando error es null', () => {
    render(
      <CancelConfirmInline
        patientName="Ana García"
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

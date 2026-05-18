import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockMutate = vi.hoisted(() => vi.fn())
const mockCreateUser = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-create-professional-user', () => ({
  useCreateProfessionalUser: mockCreateUser,
}))

import { CreateUserModal } from './CreateUserModal'

describe('CreateUserModal', () => {
  const defaultProps = {
    professionalId: 'prof-1',
    professionalName: 'Dr. García',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateUser.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    })
  })

  it('muestra el nombre del profesional en el modal', () => {
    render(<CreateUserModal {...defaultProps} />)

    expect(screen.getByText('Dr. García')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('tiene campo de email y botón de confirmar', () => {
    render(<CreateUserModal {...defaultProps} />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument()
  })

  it('muestra "Doctor" como rol pre-establecido', () => {
    render(<CreateUserModal {...defaultProps} />)

    expect(screen.getByText('Doctor')).toBeInTheDocument()
  })

  it('llama a onClose cuando se hace click en Cancelar', () => {
    const onClose = vi.fn()
    render(<CreateUserModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra error de validación si el email es inválido', async () => {
    render(<CreateUserModal {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'not-valid' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('llama a mutate con professionalId y email cuando el formulario es válido', async () => {
    render(<CreateUserModal {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'doc@test.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { professionalId: 'prof-1', email: 'doc@test.com' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      )
    })
  })

  it('muestra "Creando..." mientras isPending es true', () => {
    mockCreateUser.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    })

    render(<CreateUserModal {...defaultProps} />)

    expect(screen.getByRole('button', { name: /creando/i })).toBeInTheDocument()
  })

  it('muestra el error del server en el campo email cuando onError es llamado', async () => {
    let capturedOnError: ((err: Error) => void) | undefined

    mockMutate.mockImplementation((_data: unknown, callbacks?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      capturedOnError = callbacks?.onError
    })

    render(<CreateUserModal {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'existing@test.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled()
    })

    // Simular error de servidor
    capturedOnError?.(new Error('Ya existe un usuario con ese email'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un usuario con ese email')
    })
  })
})

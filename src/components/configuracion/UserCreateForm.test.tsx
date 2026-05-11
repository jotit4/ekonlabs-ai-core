import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UserCreateForm } from './UserCreateForm'

describe('UserCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('renderiza los campos email, full_name y role', () => {
    render(<UserCreateForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rol/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invitar usuario/i })).toBeInTheDocument()
  })

  it('muestra error de validación cuando email está vacío al submit', async () => {
    const user = userEvent.setup()
    render(<UserCreateForm />)
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })

  it('muestra error de validación cuando email es inválido', async () => {
    const user = userEvent.setup()
    render(<UserCreateForm />)
    await user.type(screen.getByLabelText(/email/i), 'correo-invalido')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('email'))).toBe(true)
    })
  })

  it('muestra error de validación cuando full_name tiene menos de 2 caracteres', async () => {
    const user = userEvent.setup()
    render(<UserCreateForm />)
    await user.type(screen.getByLabelText(/email/i), 'juan@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'J')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('2'))).toBe(true)
    })
  })

  it('el botón se deshabilita mientras isSubmitting', async () => {
    // Mock fetch para que no resuelva inmediatamente
    let resolveFetch!: (value: Response) => void
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )

    const user = userEvent.setup()
    render(<UserCreateForm />)
    await user.type(screen.getByLabelText(/email/i), 'juan@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García')

    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    // Mientras fetch no resuelve, el botón debe estar deshabilitado
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled()
    })

    // Resolver para no dejar promesa colgada
    resolveFetch(new Response(JSON.stringify({ success: true }), { status: 201 }))
  })

  it('muestra error inline "Ya existe un usuario con ese email" cuando fetch retorna 409', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Ya existe un usuario con ese email en esta organización' }),
        { status: 409 }
      )
    )

    const user = userEvent.setup()
    render(<UserCreateForm />)
    await user.type(screen.getByLabelText(/email/i), 'existente@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Usuario Existente')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/ya existe/i)
    })
  })

  it('muestra mensaje de éxito y resetea el formulario cuando fetch retorna 201', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, user: { user_id: 'abc-123' } }),
        { status: 201 }
      )
    )

    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<UserCreateForm onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText(/email/i), 'nuevo@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Usuario')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/recibirá un email/i)
    })
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})

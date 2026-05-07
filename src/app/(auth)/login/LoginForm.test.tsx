import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import LoginForm from './LoginForm'

const mockPush = vi.fn()
const mockRefresh = vi.fn()
const mockSignIn = vi.fn()
const mockGetSession = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

// JWT con role receptionist (redirect → /agenda)
const RECEPTIONIST_JWT =
  'h.' +
  btoa(JSON.stringify({ role: 'receptionist', tenant_id: 't1' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_') +
  '.sig'

// JWT con role doctor (redirect → /pacientes)
const DOCTOR_JWT =
  'h.' +
  btoa(JSON.stringify({ role: 'doctor', tenant_id: 't1' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_') +
  '.sig'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignIn,
      getSession: mockGetSession,
    },
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza campo email, campo contraseña y botón de submit', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /iniciar sesión/i }),
    ).toBeInTheDocument()
  })

  it('campo email tiene autoFocus', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toHaveFocus()
  })

  it('botón submit se deshabilita y cambia texto durante submit', async () => {
    let resolveSignIn: (value: unknown) => void
    mockSignIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
    )
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(
      screen.getByRole('button', { name: /iniciando sesión/i }),
    ).toBeDisabled()
    resolveSignIn!({ error: { message: 'cancelled' } })
  })

  it('muestra "Email o contraseña incorrectos" cuando signInWithPassword retorna error', async () => {
    mockSignIn.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    })
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Email o contraseña incorrectos',
      )
    })
  })

  it('llama a signInWithPassword con email y password al hacer submit válido', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    mockGetSession.mockResolvedValueOnce({ data: { session: { access_token: RECEPTIONIST_JWT } } })
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'admin@clinica.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'admin@clinica.com',
        password: 'password123',
      })
    })
  })

  it('receptionist/admin navega a /agenda después de login exitoso', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    mockGetSession.mockResolvedValueOnce({ data: { session: { access_token: RECEPTIONIST_JWT } } })
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'admin@clinica.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/agenda')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('doctor navega a /pacientes después de login exitoso', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    mockGetSession.mockResolvedValueOnce({ data: { session: { access_token: DOCTOR_JWT } } })
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'doctor@clinica.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pacientes')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
})

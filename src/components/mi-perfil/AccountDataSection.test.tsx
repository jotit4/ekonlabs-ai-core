import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountDataSection } from './AccountDataSection'

const mockUpdateUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser: mockUpdateUser },
  }),
}))

const PROFILE = {
  data: { full_name: 'Dr House', login_email: 'house@isadi.com', role: 'doctor' },
}

function mockFetchProfile(patchResponse?: unknown) {
  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => patchResponse ?? { data: { full_name: 'Nuevo Nombre' } },
      } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => PROFILE } as Response)
  }) as unknown as typeof fetch
}

describe('AccountDataSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })
  })

  it('muestra skeleton mientras carga y luego los datos', async () => {
    mockFetchProfile()
    render(<AccountDataSection role="doctor" />)
    expect(screen.getByTestId('account-data-loading')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr House')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('house@isadi.com')).toBeInTheDocument()
  })

  it('al editar el nombre y guardar llama PATCH /api/me/profile con { full_name }', async () => {
    mockFetchProfile()
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('Dr House'))

    const input = screen.getByLabelText('Nombre completo')
    await user.clear(input)
    await user.type(input, 'Nuevo Nombre')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/profile',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ full_name: 'Nuevo Nombre' }) }),
      )
    })
  })

  it('cambiar email llama supabase.auth.updateUser({ email }) y muestra "Pendiente de confirmación"', async () => {
    mockFetchProfile()
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('house@isadi.com'))

    const emailInput = screen.getByLabelText('Email de inicio de sesión')
    await user.clear(emailInput)
    await user.type(emailInput, 'nuevo@isadi.com')
    await user.click(screen.getByRole('button', { name: /actualizar email/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'nuevo@isadi.com' })
    })
    expect(screen.getByText(/Pendiente de confirmación/i)).toBeInTheDocument()
    expect(screen.getByText(/nuevo@isadi.com/)).toBeInTheDocument()
  })

  it('email duplicado muestra "Ese email ya está en uso"', async () => {
    mockFetchProfile()
    mockUpdateUser.mockResolvedValue({ data: {}, error: { message: 'Email already registered' } })
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('house@isadi.com'))

    const emailInput = screen.getByLabelText('Email de inicio de sesión')
    await user.clear(emailInput)
    await user.type(emailInput, 'dup@isadi.com')
    await user.click(screen.getByRole('button', { name: /actualizar email/i }))

    await waitFor(() => {
      expect(screen.getByText('Ese email ya está en uso')).toBeInTheDocument()
    })
  })

  it('contraseñas que no coinciden bloquean el submit (no llama Supabase)', async () => {
    mockFetchProfile()
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('Dr House'))

    await user.type(screen.getByLabelText('Nueva contraseña'), 'password123')
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'distinta456')
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('contraseña menor a 8 caracteres bloquea el submit', async () => {
    mockFetchProfile()
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('Dr House'))

    await user.type(screen.getByLabelText('Nueva contraseña'), 'short')
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'short')
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('cambio de contraseña válido llama updateUser({ password }) y muestra éxito', async () => {
    mockFetchProfile()
    const user = userEvent.setup()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('Dr House'))

    await user.type(screen.getByLabelText('Nueva contraseña'), 'password123')
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'password123' })
    })
    expect(screen.getByText('Contraseña actualizada.')).toBeInTheDocument()
  })

  it('muestra el rol en solo lectura (texto, sin input)', async () => {
    mockFetchProfile()
    render(<AccountDataSection role="doctor" />)
    await waitFor(() => screen.getByDisplayValue('Dr House'))
    const roleEl = screen.getByTestId('account-role')
    expect(roleEl).toHaveTextContent('Médico')
    expect(roleEl.tagName).not.toBe('INPUT')
  })
})

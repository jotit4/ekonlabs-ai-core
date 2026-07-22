import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserCreateForm } from './UserCreateForm'

/**
 * El form pide los profesionales vinculables (react-query) cuando el rol es
 * médico → necesita provider. Se monta siempre para no divergir entre tests.
 */
function renderForm(props: React.ComponentProps<typeof UserCreateForm> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UserCreateForm {...props} />
    </QueryClientProvider>,
  )
}

/** Respuesta del GET /api/profesionales usada por los tests del rol médico. */
function mockProfesionales(
  professionals: Array<{
    professional_id: string
    name: string
    active: boolean
    linked_user_email: string | null
  }>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ professionals }),
    }),
  )
}

describe('UserCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('renderiza los campos email, full_name y role', () => {
    renderForm()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rol/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invitar usuario/i })).toBeInTheDocument()
  })

  it('muestra error de validación cuando email está vacío al submit', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })

  it('muestra error de validación cuando email es inválido', async () => {
    const user = userEvent.setup()
    renderForm()
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
    renderForm()
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
    renderForm()
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
    renderForm()
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
    renderForm({ onSuccess })
    await user.type(screen.getByLabelText(/email/i), 'nuevo@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Usuario')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/recibirá un email/i)
    })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  // ── Subtipo de atención (migración 056) ────────────────────────────────────
  // Doctor-fila / Doctor-turno se eligen al crear el usuario y definen su
  // navegación por defecto.

  it('con rol Recepcionista NO pide profesional ni tipo de atención', () => {
    renderForm()
    expect(screen.queryByLabelText(/profesional vinculado/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/tipo de atención/i)).not.toBeInTheDocument()
  })

  it('al elegir rol Médico aparecen profesional vinculado y tipo de atención', async () => {
    mockProfesionales([
      { professional_id: 'p1', name: 'Dra. Pérez', active: true, linked_user_email: null },
    ])
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(/rol/i), 'doctor')

    expect(await screen.findByLabelText(/profesional vinculado/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tipo de atención/i)).toBeInTheDocument()
    // Las dos opciones del subtipo, con el vocabulario del usuario
    expect(screen.getByRole('option', { name: /orden de llegada/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /por turnos/i })).toBeInTheDocument()
  })

  it('no ofrece profesionales inactivos ni ya vinculados a otra cuenta', async () => {
    mockProfesionales([
      { professional_id: 'p1', name: 'Dra. Libre', active: true, linked_user_email: null },
      { professional_id: 'p2', name: 'Dr. Inactivo', active: false, linked_user_email: null },
      { professional_id: 'p3', name: 'Dr. Tomado', active: true, linked_user_email: 'x@y.com' },
    ])
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(/rol/i), 'doctor')
    await screen.findByLabelText(/profesional vinculado/i)

    expect(screen.getByRole('option', { name: 'Dra. Libre' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Dr. Inactivo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Dr. Tomado' })).not.toBeInTheDocument()
  })

  it('un médico sin profesional ni tipo de atención NO se envía (validación)', async () => {
    mockProfesionales([
      { professional_id: 'p1', name: 'Dra. Pérez', active: true, linked_user_email: null },
    ])
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/email/i), 'medico@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Médico Nuevo')
    await user.selectOptions(screen.getByLabelText(/rol/i), 'doctor')
    await screen.findByLabelText(/profesional vinculado/i)
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    // El POST nunca salió: solo se llamó al GET de profesionales
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })

  it('crea un Doctor-fila enviando professional_id y attention_mode', async () => {
    // professional_id es UUID en la DB y el schema lo valida como tal.
    const PROF_UUID = 'c686d654-0c61-4ca2-b041-477fae971aad'
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ success: true, user: { user_id: 'u1' } }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          professionals: [
            {
              professional_id: PROF_UUID,
              name: 'Dr. Juan Diego',
              active: true,
              linked_user_email: null,
            },
          ],
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/email/i), 'jd@clinica.com')
    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan Diego')
    await user.selectOptions(screen.getByLabelText(/rol/i), 'doctor')
    await screen.findByLabelText(/profesional vinculado/i)
    await user.selectOptions(screen.getByLabelText(/profesional vinculado/i), PROF_UUID)
    await user.selectOptions(screen.getByLabelText(/tipo de atención/i), 'walk_in')
    await user.click(screen.getByRole('button', { name: /invitar usuario/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/recibirá un email/i)
    })

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({
      email: 'jd@clinica.com',
      role: 'doctor',
      professional_id: PROF_UUID,
      attention_mode: 'walk_in',
    })
  })
})

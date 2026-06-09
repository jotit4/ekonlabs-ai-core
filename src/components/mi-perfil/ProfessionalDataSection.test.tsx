import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfessionalDataSection } from './ProfessionalDataSection'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const PROF = {
  data: {
    professional_id: 'prof-1',
    professional_name: 'Dr. García',
    professional_email: 'garcia@isadi.com',
    services: [
      { service_id: 'svc-1', name: 'Kinesiología' },
      { service_id: 'svc-2', name: 'Fisioterapia' },
    ],
  },
}

function mockFetch(opts: { getStatus?: number; getOk?: boolean; patchOk?: boolean; patchError?: string } = {}) {
  const { getStatus = 200, getOk = true, patchOk = true, patchError } = opts
  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      return Promise.resolve({
        ok: patchOk,
        json: async () => (patchOk
          ? { data: { professional_id: 'prof-1', name: 'Dr. Nuevo', email: 'garcia@isadi.com' } }
          : { error: patchError ?? 'error' }),
      } as Response)
    }
    return Promise.resolve({ ok: getOk, status: getStatus, json: async () => PROF } as Response)
  }) as unknown as typeof fetch
}

describe('ProfessionalDataSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cuando GET retorna 404 muestra el mensaje "no asignado"', async () => {
    mockFetch({ getStatus: 404, getOk: false })
    render(<ProfessionalDataSection />)
    await waitFor(() => {
      expect(screen.getByTestId('professional-data-not-assigned')).toBeInTheDocument()
    })
    expect(screen.getByText(/no tiene un profesional asignado/i)).toBeInTheDocument()
  })

  it('carga datos y muestra name/email editables', async () => {
    mockFetch()
    render(<ProfessionalDataSection />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr. García')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('garcia@isadi.com')).toBeInTheDocument()
  })

  it('muestra los servicios en solo lectura (sin botones de quitar/editar)', async () => {
    mockFetch()
    render(<ProfessionalDataSection />)
    await waitFor(() => screen.getByTestId('professional-services'))
    const list = screen.getByTestId('professional-services')
    expect(list).toHaveTextContent('Kinesiología')
    expect(list).toHaveTextContent('Fisioterapia')
    // No hay botones dentro de la lista de servicios
    expect(list.querySelectorAll('button').length).toBe(0)
  })

  it('al editar name/email y guardar llama PATCH /api/me/professional', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<ProfessionalDataSection />)
    await waitFor(() => screen.getByDisplayValue('Dr. García'))

    const nameInput = screen.getByLabelText('Nombre profesional')
    await user.clear(nameInput)
    await user.type(nameInput, 'Dr. Nuevo')
    await user.click(screen.getByRole('button', { name: /guardar datos profesionales/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/professional',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })

  it('incluye un link a /mi-disponibilidad', async () => {
    mockFetch()
    render(<ProfessionalDataSection />)
    await waitFor(() => screen.getByDisplayValue('Dr. García'))
    const link = screen.getByRole('link', { name: /gestionar mis horarios/i })
    expect(link).toHaveAttribute('href', '/mi-disponibilidad')
  })
})

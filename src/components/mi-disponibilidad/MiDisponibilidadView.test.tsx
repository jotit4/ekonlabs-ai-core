import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/components/profesionales/ProfessionalScheduleView', () => ({
  ProfessionalScheduleView: ({ professionalId, professionalName }: {
    professionalId: string
    professionalName: string
  }) => (
    <div
      data-testid="professional-schedule-view"
      data-professional-id={professionalId}
      data-professional-name={professionalName}
    />
  ),
}))

vi.mock('@/components/profesionales/BlockedTimesView', () => ({
  BlockedTimesView: ({ professionalId, professionalName }: {
    professionalId: string
    professionalName: string
  }) => (
    <div
      data-testid="blocked-times-view"
      data-professional-id={professionalId}
      data-professional-name={professionalName}
    />
  ),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { MiDisponibilidadView } from './MiDisponibilidadView'

describe('MiDisponibilidadView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton mientras carga', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // nunca resuelve

    render(<MiDisponibilidadView />)

    expect(screen.getByTestId('mi-disponibilidad-loading')).toBeInTheDocument()
  })

  it('muestra mensaje "no asignado" cuando API retorna 404', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      ok: false,
      json: async () => ({ error: 'Profesional no asignado' }),
    })

    render(<MiDisponibilidadView />)

    await waitFor(() => {
      expect(screen.getByTestId('mi-disponibilidad-not-assigned')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Tu cuenta aún no tiene un profesional asignado. Contactá al administrador.')
    ).toBeInTheDocument()
  })

  it('muestra mensaje de error cuando el API falla (500)', async () => {
    mockFetch.mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ error: 'Error interno' }),
    })

    render(<MiDisponibilidadView />)

    await waitFor(() => {
      expect(screen.getByTestId('mi-disponibilidad-error')).toBeInTheDocument()
    })
  })

  it('muestra ProfessionalScheduleView y BlockedTimesView cuando hay datos', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          professional_id: 'prof-1',
          professional_name: 'Dr. García',
        },
      }),
    })

    render(<MiDisponibilidadView />)

    await waitFor(() => {
      expect(screen.getByTestId('mi-disponibilidad-view')).toBeInTheDocument()
    })
    expect(screen.getByTestId('professional-schedule-view')).toHaveAttribute(
      'data-professional-id', 'prof-1'
    )
    expect(screen.getByTestId('blocked-times-view')).toHaveAttribute(
      'data-professional-name', 'Dr. García'
    )
  })

  it('muestra mensaje de error cuando fetch lanza excepción', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<MiDisponibilidadView />)

    await waitFor(() => {
      expect(screen.getByTestId('mi-disponibilidad-error')).toBeInTheDocument()
    })
  })
})

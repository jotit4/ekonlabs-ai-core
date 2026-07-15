import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// Mock @base-ui/react/dialog
vi.mock('@base-ui/react/dialog', async () => {
  const React = await import('react')
  return {
    Dialog: {
      Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', null, children),
      Backdrop: () => null,
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', { role: 'dialog' }, children),
      Title: ({ children }: { children: React.ReactNode }) =>
        React.createElement('h2', null, children),
      Close: ({
        children,
        onClick,
        'aria-label': ariaLabel,
      }: {
        children: React.ReactNode
        onClick?: () => void
        'aria-label'?: string
      }) =>
        React.createElement('button', { type: 'button', onClick, 'aria-label': ariaLabel }, children),
    },
  }
})

// Mock date-fns/locale — needs real locale object for format to work
vi.mock('date-fns/locale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns/locale')>()
  return actual
})

// SessionNotePanel (Story 14.3) se testea en su propio archivo; acá se mockea
// para no arrastrar useCurrentTenant/auth al test del modal.
vi.mock('@/components/paquetes/SessionNotePanel', () => ({
  SessionNotePanel: () => null,
}))

// AbsenceDecisionDialog se mockea para aislar el modal de sus dependencias.
vi.mock('@/components/agenda/AbsenceDecisionDialog', () => ({
  AbsenceDecisionDialog: () => null,
}))

// next/link — mockear para evitar errores de router context
vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('a', { href, ...props }, children),
  }
})

// @tanstack/react-query — useAppointmentActions usa useQueryClient
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { TurnoDetailModal } from './TurnoDetailModal'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: 'prof-1',
  appointment_time: '2026-05-14T09:00:00',
  start_at: '2026-05-14T09:00:00',
  end_at: '2026-05-14T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'Ana García' },
  services: { name: 'Kinesiología', professional: null, professional_name: 'Dra. Pérez' },
  professionals: { name: 'Dra. Pérez' },
}

describe('TurnoDetailModal', () => {
  const mockOnClose = vi.fn()
  const mockOnReschedule = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
  })

  it('NO renderiza nada cuando open=false', () => {
    render(
      <TurnoDetailModal
        open={false}
        appointment={BASE_APPOINTMENT}
        onClose={mockOnClose}
        onReschedule={mockOnReschedule}
      />,
    )
    expect(screen.queryByTestId('dialog-root')).not.toBeInTheDocument()
  })

  it('muestra el nombre del paciente cuando open=true', () => {
    render(
      <TurnoDetailModal
        open={true}
        appointment={BASE_APPOINTMENT}
        onClose={mockOnClose}
        onReschedule={mockOnReschedule}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Ana García' })).toBeInTheDocument()
  })

  it('muestra el servicio y profesional', () => {
    render(
      <TurnoDetailModal
        open={true}
        appointment={BASE_APPOINTMENT}
        onClose={mockOnClose}
        onReschedule={mockOnReschedule}
      />,
    )
    expect(screen.getByText(/Kinesiología/)).toBeInTheDocument()
    expect(screen.getByText(/Dra. Pérez/)).toBeInTheDocument()
  })

  it('al hacer click en "Reprogramar", llama onReschedule(appointment)', async () => {
    const user = userEvent.setup()
    render(
      <TurnoDetailModal
        open={true}
        appointment={BASE_APPOINTMENT}
        onClose={mockOnClose}
        onReschedule={mockOnReschedule}
      />,
    )
    await user.click(screen.getByRole('button', { name: /reprogramar/i }))
    expect(mockOnReschedule).toHaveBeenCalledWith(BASE_APPOINTMENT)
  })

  it('al hacer click en "Cerrar", llama onClose', async () => {
    const user = userEvent.setup()
    render(
      <TurnoDetailModal
        open={true}
        appointment={BASE_APPOINTMENT}
        onClose={mockOnClose}
        onReschedule={mockOnReschedule}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cerrar detalle del turno/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  // ─── Color manual del turno (paleta muda del turnero, pedido ISADI 2026-07-14) ──
  describe('color manual del turno', () => {
    it('muestra el selector de color con "Sin color" marcado cuando el turno no tiene color', () => {
      render(
        <TurnoDetailModal
          open={true}
          appointment={BASE_APPOINTMENT}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )
      expect(screen.getByRole('button', { name: 'Sin color' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('marca el swatch correspondiente cuando el turno YA tiene un color manual', () => {
      render(
        <TurnoDetailModal
          open={true}
          appointment={{ ...BASE_APPOINTMENT, color: '#FF0000' }}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )
      expect(screen.getByRole('button', { name: 'Color #FF0000' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('al elegir un color, llama PATCH /api/appointments/:id/color con el hex elegido', async () => {
      const user = userEvent.setup()
      render(
        <TurnoDetailModal
          open={true}
          appointment={BASE_APPOINTMENT}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1/color',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ color: '#00FFFF' }),
          }),
        )
      })
    })

    it('al clickear "Sin color" sobre un turno con color, envía color: null (lo limpia)', async () => {
      const user = userEvent.setup()
      render(
        <TurnoDetailModal
          open={true}
          appointment={{ ...BASE_APPOINTMENT, color: '#FF0000' }}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Sin color' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1/color',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ color: null }),
          }),
        )
      })
    })

    it('cierra el modal después de guardar el color (elegir el color ES la acción)', async () => {
      const user = userEvent.setup()
      render(
        <TurnoDetailModal
          open={true}
          appointment={BASE_APPOINTMENT}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it('muestra un error si el PATCH de color falla', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Error al actualizar el color del turno' }),
      })
      const user = userEvent.setup()
      render(
        <TurnoDetailModal
          open={true}
          appointment={BASE_APPOINTMENT}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Error al actualizar el color del turno')
      })
    })

    it('NO cierra el modal si el guardado del color falla (queda mostrando el error)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Error al actualizar el color del turno' }),
      })
      const user = userEvent.setup()
      render(
        <TurnoDetailModal
          open={true}
          appointment={BASE_APPOINTMENT}
          onClose={mockOnClose}
          onReschedule={mockOnReschedule}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })
})

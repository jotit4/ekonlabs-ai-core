import { render, screen } from '@testing-library/react'
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
// para no arrastrar useCurrentTenant/auth al test del modal (mismo recurso que
// PaquetesTracking.test con TreatmentPlanPanel en 14.2).
vi.mock('@/components/paquetes/SessionNotePanel', () => ({
  SessionNotePanel: () => null,
}))

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
})

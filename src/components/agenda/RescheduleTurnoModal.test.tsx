import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { RescheduleTurnoModal } from './RescheduleTurnoModal'
import type { Appointment } from '@/types/appointments'

// Mock @base-ui/react/dialog
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Backdrop: () => null,
    Popup: ({ children }: { children: React.ReactNode }) => (
      <div role="dialog" aria-modal="true">{children}</div>
    ),
    Title: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
      <h2 id={id} className={className}>{children}</h2>
    ),
    Close: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode
      onClick?: () => void
      className?: string
    }) => (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    ),
  },
}))

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const SAMPLE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  appointment_time: '2026-05-07T10:00:00',
  start_at: '2026-05-07T10:00:00',
  end_at: '2026-05-07T11:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'María López' },
  services: { name: 'Fisioterapia', professional: 'Rocío González', duration_minutes: 60 },
}

const mockOnClose = vi.fn()

describe('RescheduleTurnoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
  })

  describe('renderizado', () => {
    it('renderiza los campos de fecha y hora cuando open=true', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.getByLabelText('Nueva fecha')).toBeInTheDocument()
      expect(screen.getByLabelText('Nuevo horario')).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(
        <RescheduleTurnoModal
          open={false}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.queryByLabelText('Nueva fecha')).not.toBeInTheDocument()
    })

    it('muestra el nombre del paciente en el título', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.getByText(/María López/)).toBeInTheDocument()
    })

    it('tiene los botones Guardar y Cancelar con min-h-[44px]', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      const saveBtn = screen.getByRole('button', { name: /guardar/i })
      const cancelBtn = screen.getByRole('button', { name: /cancelar/i })
      expect(saveBtn.className).toContain('min-h-[44px]')
      expect(cancelBtn.className).toContain('min-h-[44px]')
    })
  })

  describe('validación', () => {
    it('muestra error de validación cuando la fecha está vacía', async () => {
      const user = userEvent.setup()
      // Appointment sin start_at — defaultDate y defaultTime quedan vacíos
      const appointmentSinFecha: Appointment = {
        ...SAMPLE_APPOINTMENT,
        start_at: '', // forzar defaultTime y defaultDate vacíos
      }
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={appointmentSinFecha}
          date="2026-05-07"
        />
      )

      // Intentar guardar sin seleccionar horario (el select queda en "")
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      // Debería mostrar error de validación (horario inválido)
      const alert = await screen.findByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  describe('botón Cancelar', () => {
    it('llama a onClose cuando se hace click en Cancelar', async () => {
      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })

  describe('reset del form al cambiar appointment', () => {
    it('resetea el form cuando el appointment cambia (turno A → turno B)', async () => {
      const APPOINTMENT_B: Appointment = {
        ...SAMPLE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-08T14:00:00',
        end_at: '2026-05-08T15:00:00',
        patients: { full_name: 'Carlos Gómez' },
      }

      const { rerender } = render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      // Verificar que muestra la fecha del turno A
      const dateInput = screen.getByLabelText('Nueva fecha') as HTMLInputElement
      expect(dateInput.value).toBe('2026-05-07')

      // Cambiar al turno B
      rerender(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={APPOINTMENT_B}
          date="2026-05-08"
        />
      )

      // El form debe resetear al turno B
      await waitFor(() => {
        const dateInputB = screen.getByLabelText('Nueva fecha') as HTMLInputElement
        expect(dateInputB.value).toBe('2026-05-08')
      })
    })
  })

  describe('manejo de errores de API', () => {
    it('muestra error de slot conflict (409) como mensaje inline', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'slot_conflict' }),
      })

      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      // Completar formulario: la fecha ya tiene valor por defecto, seleccionar hora
      const timeSelect = screen.getByLabelText('Nuevo horario')
      await user.selectOptions(timeSelect, '08:00')

      await user.click(screen.getByRole('button', { name: /guardar/i }))

      const errorMsg = await screen.findByText(/Ese horario ya no está disponible/i)
      expect(errorMsg).toBeInTheDocument()
    })
  })
})

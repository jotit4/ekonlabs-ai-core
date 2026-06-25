import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({
      href,
      children,
      ...props
    }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('a', { href, ...props }, children),
  }
})

vi.mock('@/hooks/use-user-role', () => ({
  useUserRole: vi.fn(() => 'receptionist'),
}))

vi.mock('@/lib/agenda/patient-ficha-href', () => ({
  patientFichaHref: vi.fn(() => '/pacientes/pat-1'),
}))

vi.mock('@/components/agenda/RescheduleTurnoModal', () => ({
  RescheduleTurnoModal: () => null,
}))

vi.mock('@/components/agenda/AbsenceDecisionDialog', () => ({
  AbsenceDecisionDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="absence-dialog">
      <button type="button" onClick={onClose}>
        Cerrar diálogo
      </button>
    </div>
  ),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Estado mutable del hook stub — se puede cambiar entre tests con asignación directa
let mockCancelTarget: Appointment | null = null
let mockAbsenceTarget: {
  appointment: Appointment
  action: 'no_show' | 'cancelled'
} | null = null

const mockSetCancelTarget = vi.fn()
const mockClearCancelError = vi.fn()
const mockHandleCancelConfirm = vi.fn().mockResolvedValue(undefined)
const mockHandleAttendanceSelect = vi.fn().mockResolvedValue(undefined)
const mockClearAbsenceTarget = vi.fn()
const mockHandleAbsenceConfirm = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/use-appointment-actions', () => ({
  useAppointmentActions: vi.fn(() => ({
    cancelTarget: mockCancelTarget,
    cancelLoading: false,
    cancelError: null,
    setCancelTarget: mockSetCancelTarget,
    clearCancelError: mockClearCancelError,
    handleCancelConfirm: mockHandleCancelConfirm,
    attendanceLoading: false,
    handleAttendanceSelect: mockHandleAttendanceSelect,
    absenceTarget: mockAbsenceTarget,
    absenceLoading: false,
    absenceError: null,
    clearAbsenceTarget: mockClearAbsenceTarget,
    handleAbsenceConfirm: mockHandleAbsenceConfirm,
  })),
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

// Importar DESPUÉS de los vi.mock (hoisting garantiza el orden)
import { ProximosTurnos } from './ProximosTurnos'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Fecha en el futuro lejano para que isAfter() incluya al turno en `proximos`
const FUTURE_START = '2099-12-31T10:00:00'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: 'prof-1',
  appointment_time: FUTURE_START,
  start_at: FUTURE_START,
  end_at: '2099-12-31T11:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-01-01T00:00:00.000Z',
  patients: { full_name: 'Ana García' },
  services: { name: 'Kinesiología', professional: null, professional_name: 'Dra. Pérez' },
  professionals: { name: 'Dra. Pérez' },
}

const SERIE_APPOINTMENT: Appointment = {
  ...BASE_APPOINTMENT,
  appointment_id: 'apt-2',
  package_id: 'trt-1',
  session_index: 3,
  patients: { full_name: 'Juan López' },
  treatments: { total_sessions: 10, status: 'active' },
}

function renderProximosTurnos(
  appointments: Appointment[] = [BASE_APPOINTMENT],
  hoyISO = '2099-12-31',
) {
  return render(
    <ProximosTurnos
      appointments={appointments}
      hoyISO={hoyISO}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProximosTurnos — Story D', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restaurar estado del hook stub
    mockCancelTarget = null
    mockAbsenceTarget = null
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
  })

  describe('KebabMenu contiene "Cancelar turno"', () => {
    it('muestra el item "Cancelar turno" en el menú de acciones', async () => {
      const user = userEvent.setup()
      renderProximosTurnos()

      const kebabBtn = screen.getByRole('button', { name: /más acciones para ana garcía/i })
      await user.click(kebabBtn)

      expect(screen.getByRole('menuitem', { name: /cancelar turno/i })).toBeInTheDocument()
    })

    it('al hacer click en "Cancelar turno", llama clearCancelError y setCancelTarget con el turno', async () => {
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /más acciones para ana garcía/i }))
      await user.click(screen.getByRole('menuitem', { name: /cancelar turno/i }))

      expect(mockClearCancelError).toHaveBeenCalled()
      expect(mockSetCancelTarget).toHaveBeenCalledWith(
        expect.objectContaining({ appointment_id: 'apt-1' }),
      )
    })
  })

  describe('CancelConfirmInline aparece cuando cancelTarget coincide con el turno', () => {
    it('muestra la confirmación inline cuando cancelTarget es el turno actual', () => {
      mockCancelTarget = BASE_APPOINTMENT
      renderProximosTurnos()

      expect(screen.getByText(/¿Cancelar el turno de Ana García\?/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sí, cancelar turno/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /no, volver/i })).toBeInTheDocument()
    })

    it('al confirmar la cancelación, llama handleCancelConfirm del hook', async () => {
      mockCancelTarget = BASE_APPOINTMENT
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /sí, cancelar turno/i }))

      expect(mockHandleCancelConfirm).toHaveBeenCalled()
    })

    it('al hacer "No, volver", llama setCancelTarget(null) y clearCancelError', async () => {
      mockCancelTarget = BASE_APPOINTMENT
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /no, volver/i }))

      expect(mockSetCancelTarget).toHaveBeenCalledWith(null)
      expect(mockClearCancelError).toHaveBeenCalled()
    })

    it('NO muestra la confirmación de cancelar cuando cancelTarget es un turno diferente', () => {
      mockCancelTarget = { ...BASE_APPOINTMENT, appointment_id: 'apt-otro' }
      renderProximosTurnos()

      expect(screen.queryByText(/¿Cancelar el turno de/)).not.toBeInTheDocument()
    })
  })

  describe('"No vino" usa handleAttendanceSelect del hook', () => {
    it('al hacer click en "No vino", llama handleAttendanceSelect con el turno y no_show', async () => {
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /más acciones para ana garcía/i }))
      await user.click(screen.getByRole('menuitem', { name: /no vino/i }))

      expect(mockHandleAttendanceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ appointment_id: 'apt-1' }),
        'no_show',
      )
    })

    it('para turno de serie, "No vino" llama handleAttendanceSelect con ese turno', async () => {
      const user = userEvent.setup()
      renderProximosTurnos([SERIE_APPOINTMENT])

      await user.click(screen.getByRole('button', { name: /más acciones para juan lópez/i }))
      await user.click(screen.getByRole('menuitem', { name: /no vino/i }))

      expect(mockHandleAttendanceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ appointment_id: 'apt-2', package_id: 'trt-1' }),
        'no_show',
      )
    })
  })

  describe('Bug "Deshacer" — eliminado (status:confirmed rechazado por el backend)', () => {
    it('tras marcar "Llegó", NO hay botón "Deshacer"', async () => {
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /marcar que ana garcía llegó/i }))

      expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument()
    })

    it('el fetch para "Llegó" envía status:completed y NO status:confirmed', async () => {
      const user = userEvent.setup()
      renderProximosTurnos()

      await user.click(screen.getByRole('button', { name: /marcar que ana garcía llegó/i }))

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { status: string }
      expect(body.status).toBe('completed')
    })
  })

  describe('AbsenceDecisionDialog se muestra para el turno correcto', () => {
    it('muestra AbsenceDecisionDialog cuando absenceTarget coincide con el turno actual', () => {
      mockAbsenceTarget = { appointment: BASE_APPOINTMENT, action: 'cancelled' }
      renderProximosTurnos()

      expect(screen.getByTestId('absence-dialog')).toBeInTheDocument()
    })

    it('NO muestra AbsenceDecisionDialog cuando absenceTarget es de otro turno', () => {
      mockAbsenceTarget = {
        appointment: { ...BASE_APPOINTMENT, appointment_id: 'apt-otro' },
        action: 'cancelled',
      }
      renderProximosTurnos()

      expect(screen.queryByTestId('absence-dialog')).not.toBeInTheDocument()
    })
  })

  describe('estado de carga y vacío', () => {
    it('muestra skeleton con aria-busy cuando isLoading=true', () => {
      render(
        <ProximosTurnos
          appointments={[]}
          hoyISO="2099-12-31"
          isLoading={true}
          isError={false}
          onRetry={vi.fn()}
        />,
      )
      const section = document.querySelector('section[aria-busy]')
      expect(section).toBeInTheDocument()
    })

    it('muestra mensaje de error y botón Reintentar cuando isError=true', async () => {
      const mockRetry = vi.fn()
      const user = userEvent.setup()
      render(
        <ProximosTurnos
          appointments={[]}
          hoyISO="2099-12-31"
          isLoading={false}
          isError={true}
          onRetry={mockRetry}
        />,
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockRetry).toHaveBeenCalled()
    })
  })

  describe('Link de paciente (Story A) se mantiene intacto', () => {
    it('el nombre del paciente es un link cuando hay patient_id', () => {
      renderProximosTurnos()

      const link = screen.getByRole('link', { name: /ana garcía/i })
      expect(link).toHaveAttribute('href', '/pacientes/pat-1')
    })
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { CalendarView } from './CalendarView'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  appointment_time: '2026-05-07T09:00:00',
  start_at: '2026-05-07T09:00:00',
  end_at: '2026-05-07T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'Juan García' },
  services: { name: 'Kinesiología', professional: 'Dra. Patricia Pérez' },
  professionals: null,
}

const mockOnRefetch = vi.fn()

describe('CalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
  })

  describe('renderizado básico', () => {
    it('muestra mensaje vacío cuando appointments está vacío', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByText(/sin turnos para este día/i)).toBeInTheDocument()
    })

    it('muestra skeleton cuando isLoading=true', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={true}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    })

    it('muestra error con botón Reintentar cuando isError=true', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })

    it('llama onRefetch al hacer click en Reintentar', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockOnRefetch).toHaveBeenCalledOnce()
    })
  })

  describe('renderizado de turnos', () => {
    it('muestra el nombre del paciente', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
    })

    it('muestra el horario inicio y fin del turno', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByText('09:00')).toBeInTheDocument()
      expect(screen.getByText('10:00')).toBeInTheDocument()
    })

    it('muestra el nombre del servicio', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByText(/Kinesiología/)).toBeInTheDocument()
    })

    it('ordena los turnos cronológicamente', () => {
      const earlyApt: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-07T07:00:00',
        end_at: '2026-05-07T08:00:00',
        patients: { full_name: 'Ana López' },
      }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT, earlyApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      // Ana López (07:00) debe aparecer antes que Juan García (09:00)
      const names = screen.getAllByText(/Ana López|Juan García/)
      expect(names[0]).toHaveTextContent('Ana López')
      expect(names[1]).toHaveTextContent('Juan García')
    })

    it('filtra appointments inválidos (sin start_at o end_at)', () => {
      const invalidApt = { ...BASE_APPOINTMENT, appointment_id: 'apt-bad', start_at: null } as unknown as Appointment
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT, invalidApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      // Solo el turno válido debe renderizarse
      expect(screen.getAllByText('Juan García')).toHaveLength(1)
    })
  })

  describe('callback onReschedule', () => {
    it('llama onReschedule cuando se hace click en el botón reprogramar', async () => {
      const mockOnReschedule = vi.fn()
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onReschedule={mockOnReschedule}
        />
      )
      await user.click(screen.getByLabelText(/reprogramar turno de juan garcía/i))
      expect(mockOnReschedule).toHaveBeenCalledWith(BASE_APPOINTMENT)
    })

    it('no muestra el botón reprogramar cuando onReschedule no se pasa', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.queryByLabelText(/reprogramar/i)).not.toBeInTheDocument()
    })
  })

  describe('Feature B — Cancelar turno', () => {
    it('muestra botón de cancelar en cada turno activo', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByLabelText(/cancelar turno de juan garcía/i)).toBeInTheDocument()
    })

    it('abre modal de confirmación al hacer click en cancelar', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/cancelar turno de juan garcía/i))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/¿Cancelar el turno de Juan García\?/i)).toBeInTheDocument()
      expect(screen.getByText(/Esta acción no se puede deshacer/i)).toBeInTheDocument()
    })

    it('cierra el modal al hacer click en "No, volver"', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/cancelar turno de juan garcía/i))
      await user.click(screen.getByRole('button', { name: /no, volver/i }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('llama a PATCH /api/appointments/[id]/status al confirmar cancelación', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/cancelar turno de juan garcía/i))
      await user.click(screen.getByRole('button', { name: /sí, cancelar turno/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled' }),
          })
        )
      })
    })

    it('invalida queries de la agenda tras confirmar cancelación', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/cancelar turno de juan garcía/i))
      await user.click(screen.getByRole('button', { name: /sí, cancelar turno/i }))

      await waitFor(() => {
        expect(mockInvalidateQueries).toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: ['agenda', 'day', '2026-05-07'] })
        )
      })
    })

    it('no muestra botón cancelar para turnos ya cancelados', () => {
      const cancelledApt: Appointment = { ...BASE_APPOINTMENT, status: 'cancelled' }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[cancelledApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.queryByLabelText(/cancelar turno/i)).not.toBeInTheDocument()
    })
  })

  describe('Feature C — Marcar asistencia', () => {
    it('muestra botón de marcar asistencia (reloj) en cada turno activo', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByLabelText(/marcar asistencia de juan garcía/i)).toBeInTheDocument()
    })

    it('abre dropdown al hacer click en el reloj', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/marcar asistencia de juan garcía/i))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /confirmar asistencia/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /marcar no-show/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /cerrar/i })).toBeInTheDocument()
    })

    it('cierra el dropdown al hacer click en "Cerrar"', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/marcar asistencia de juan garcía/i))
      await user.click(screen.getByRole('menuitem', { name: /cerrar/i }))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('llama a PATCH con status completed al confirmar asistencia', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/marcar asistencia de juan garcía/i))
      await user.click(screen.getByRole('menuitem', { name: /confirmar asistencia/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' }),
          })
        )
      })
    })

    it('llama a PATCH con status no_show al marcar no-show', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      await user.click(screen.getByLabelText(/marcar asistencia de juan garcía/i))
      await user.click(screen.getByRole('menuitem', { name: /marcar no-show/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'no_show' }),
          })
        )
      })
    })

    it('no muestra botón de asistencia para turnos cancelados', () => {
      const cancelledApt: Appointment = { ...BASE_APPOINTMENT, status: 'cancelled' }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[cancelledApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.queryByLabelText(/marcar asistencia/i)).not.toBeInTheDocument()
    })
  })

  describe('Feature D — Link nombre paciente', () => {
    it('muestra el nombre del paciente como link cuando patient_id está presente', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      const link = screen.getByRole('link', { name: /ver ficha de juan garcía/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/pacientes/pat-1')
    })

    it('muestra el nombre sin link cuando patient_id es null', () => {
      const noPidApt: Appointment = { ...BASE_APPOINTMENT, patient_id: null }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[noPidApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /ver ficha/i })).not.toBeInTheDocument()
    })
  })
})

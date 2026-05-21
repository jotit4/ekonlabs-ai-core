import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

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
}

const mockOnRefetch = vi.fn()

describe('CalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  describe('indicador de sync pendiente', () => {
    it('muestra icono de reloj cuando calendar_event_id es null', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.getByLabelText(/pendiente de sincronización/i)).toBeInTheDocument()
    })

    it('no muestra icono de reloj cuando calendar_event_id está definido', () => {
      const syncedApt: Appointment = { ...BASE_APPOINTMENT, calendar_event_id: 'gcal-event-123' }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[syncedApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />
      )
      expect(screen.queryByLabelText(/pendiente de sincronización/i)).not.toBeInTheDocument()
    })
  })
})

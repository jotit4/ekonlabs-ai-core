import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AgendaDayView } from './AgendaDayView'
import type { Appointment } from '@/types/appointments'

const mockRefetch = vi.fn()

const SAMPLE_APPOINTMENTS: Appointment[] = [
  {
    appointment_id: 'apt-1',
    tenant_id: 'tenant-1',
    phone_number: '+541100000000',
    patient_id: 'pat-1',
    service_id: 'svc-1',
    appointment_time: '2026-05-07T12:00:00',
    start_at: '2026-05-07T12:00:00',
    end_at: '2026-05-07T13:00:00',
    status: 'confirmed',
    calendar_event_id: null,
    reminder_sent_at: null,
    attendance_confirmed: null,
    created_at: '2026-05-01T00:00:00',
    patients: { full_name: 'Juan García' },
    services: { name: 'Kinesiología', professional: 'Patricia Pérez' },
  },
  {
    appointment_id: 'apt-2',
    tenant_id: 'tenant-1',
    phone_number: '+541100000001',
    patient_id: 'pat-2',
    service_id: 'svc-2',
    appointment_time: '2026-05-07T14:00:00',
    start_at: '2026-05-07T14:00:00',
    end_at: '2026-05-07T15:00:00',
    status: 'pending',
    calendar_event_id: null,
    reminder_sent_at: null,
    attendance_confirmed: null,
    created_at: '2026-05-01T00:00:00',
    patients: { full_name: 'María López' },
    services: { name: 'Fisioterapia', professional: 'Rocío González' },
  },
  {
    appointment_id: 'apt-3',
    tenant_id: 'tenant-1',
    phone_number: '+541100000002',
    patient_id: 'pat-3',
    service_id: 'svc-3',
    appointment_time: '2026-05-07T15:00:00',
    start_at: '2026-05-07T15:00:00',
    end_at: '2026-05-07T16:00:00',
    status: 'cancelled',
    calendar_event_id: null,
    reminder_sent_at: null,
    attendance_confirmed: null,
    created_at: '2026-05-01T00:00:00.000Z',
    patients: { full_name: 'Carlos Ruiz' },
    services: { name: 'Pilates', professional: 'Patricia Pérez' },
  },
]

describe('AgendaDayView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado de carga', () => {
    it('muestra skeleton mientras isLoading=true', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={true}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    })

    it('no muestra skeleton cuando isLoading=false', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.queryByLabelText('Cargando turnos')).not.toBeInTheDocument()
    })
  })

  describe('estado de error', () => {
    it('muestra error inline con botón Reintentar cuando isError=true', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })

    it('llama a onRefetch al hacer click en Reintentar', async () => {
      const user = userEvent.setup()
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockRefetch}
        />,
      )
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockRefetch).toHaveBeenCalledOnce()
    })

    it('no muestra spinner genérico — usa texto inline', () => {
      const { container } = render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockRefetch}
        />,
      )
      expect(container.querySelector('[role="progressbar"]')).toBeNull()
      expect(container.querySelector('.spinner')).toBeNull()
    })
  })

  describe('estado vacío', () => {
    it('muestra "Sin turnos para hoy" cuando no hay datos', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByText('Sin turnos para hoy')).toBeInTheDocument()
    })
  })

  describe('vista con datos', () => {
    it('muestra turnos agrupados por profesional', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={SAMPLE_APPOINTMENTS}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByText('Patricia Pérez')).toBeInTheDocument()
      expect(screen.getByText('Rocío González')).toBeInTheDocument()
    })

    it('muestra todos los pacientes', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={SAMPLE_APPOINTMENTS}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
      expect(screen.getByText('María López')).toBeInTheDocument()
      expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
    })

    it('los turnos del mismo profesional aparecen en la misma sección', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={SAMPLE_APPOINTMENTS}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      const patriciaSection = screen.getByRole('region', { name: 'Patricia Pérez' })
      // Patricia Pérez tiene 2 turnos (apt-1 y apt-3)
      const cards = patriciaSection.querySelectorAll('[class*="min-h-[44px]"]')
      expect(cards.length).toBe(2)
    })

    it('muestra estados en español', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={SAMPLE_APPOINTMENTS}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      expect(screen.getByText('Confirmado')).toBeInTheDocument()
      expect(screen.getByText('Pendiente')).toBeInTheDocument()
      expect(screen.getByText('Cancelado')).toBeInTheDocument()
    })
  })

  describe('parámetros recibidos por props', () => {
    it('recibe appointments como prop y los renderiza', () => {
      render(
        <AgendaDayView
          date="2026-05-07"
          appointments={SAMPLE_APPOINTMENTS}
          isLoading={false}
          isError={false}
          onRefetch={mockRefetch}
        />,
      )
      // Verifica que los datos del hook compartido se muestran correctamente
      expect(screen.getByText('Juan García')).toBeInTheDocument()
    })
  })
})

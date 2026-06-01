import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// Mock CSS imports
vi.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}))

// Mock react-big-calendar
vi.mock('react-big-calendar', async () => {
  const React = await import('react')
  return {
    Calendar: (props: {
      events: unknown[]
      onSelectEvent?: (e: unknown) => void
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components?: any
    }) => {
      return React.createElement(
        'div',
        { 'data-testid': 'rbc-calendar' },
        props.events.map((e: unknown) => {
          const ev = e as { id: string; title: string; resource: Appointment }
          return React.createElement(
            'div',
            {
              key: ev.id,
              'data-testid': `event-${ev.id}`,
              onClick: () => props.onSelectEvent?.(ev),
            },
            props.components?.event ? props.components.event({ event: ev }) : ev.title,
          )
        }),
      )
    },
    dateFnsLocalizer: () => ({}),
    Views: { WEEK: 'week', MONTH: 'month' },
  }
})

// Usar el locale real `es` — la vista Semana llama format(day, 'EEE', { locale: es })
// y date-fns v4 necesita un locale completo (un stub vacío lanza
// "Cannot read properties of undefined (reading 'preprocessor')").
vi.mock('date-fns/locale', async () => {
  const actual = await vi.importActual<typeof import('date-fns/locale')>('date-fns/locale')
  return { es: actual.es }
})

import { CalendarViewRangeReadOnly } from './CalendarViewRangeReadOnly'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: null,
  appointment_time: '2026-05-14T09:00:00',
  start_at: '2026-05-14T09:00:00',
  end_at: '2026-05-14T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'María López' },
  services: { name: 'Consulta', professional: null, professional_name: 'Dr. Pérez' },
  professionals: { name: 'Dr. Pérez' },
}

const mockOnRefetch = vi.fn()

describe('CalendarViewRangeReadOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza la grilla de 7 días en vista Semana cuando isLoading=false', () => {
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    // La vista Semana (WeekColumnsView) renderiza 7 cabeceras de día (lun-dom)
    expect(screen.getByText('lun')).toBeInTheDocument()
    expect(screen.getByText('dom')).toBeInTheDocument()
  })

  it('renderiza el calendario con data-testid="rbc-calendar" en vista Mes', () => {
    render(
      <CalendarViewRangeReadOnly
        view="month"
        date="2026-05-12"
        appointments={[]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    expect(screen.getByTestId('rbc-calendar')).toBeInTheDocument()
  })

  it('muestra skeleton cuando isLoading=true', () => {
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[]}
        isLoading={true}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    expect(screen.queryByTestId('rbc-calendar')).not.toBeInTheDocument()
  })

  it('muestra error con botón Reintentar cuando isError=true', () => {
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[]}
        isLoading={false}
        isError={true}
        onRefetch={mockOnRefetch}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('al hacer click en "Reintentar", llama onRefetch', async () => {
    const user = userEvent.setup()
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[]}
        isLoading={false}
        isError={true}
        onRefetch={mockOnRefetch}
      />,
    )
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(mockOnRefetch).toHaveBeenCalledOnce()
  })

  it('mapea appointments a eventos en vista Mes (data-testid="event-*")', () => {
    render(
      <CalendarViewRangeReadOnly
        view="month"
        date="2026-05-12"
        appointments={[BASE_APPOINTMENT]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    expect(screen.getByTestId('event-apt-1')).toBeInTheDocument()
  })

  it('mapea appointments a eventos en vista Semana (turno visible en su columna)', () => {
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[BASE_APPOINTMENT]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    // En la grilla de Semana el turno se muestra con su hora y el nombre del paciente
    expect(screen.getByText('María López')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
  })

  it('al hacer click en un evento (vista Mes), llama onAppointmentClick con el appointment correcto', async () => {
    const user = userEvent.setup()
    const mockOnAppointmentClick = vi.fn()
    render(
      <CalendarViewRangeReadOnly
        view="month"
        date="2026-05-12"
        appointments={[BASE_APPOINTMENT]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
        onAppointmentClick={mockOnAppointmentClick}
      />,
    )
    await user.click(screen.getByTestId('event-apt-1'))
    expect(mockOnAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
  })

  it('al hacer click en un evento (vista Semana), llama onAppointmentClick con el appointment correcto', async () => {
    const user = userEvent.setup()
    const mockOnAppointmentClick = vi.fn()
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date="2026-05-12"
        appointments={[BASE_APPOINTMENT]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
        onAppointmentClick={mockOnAppointmentClick}
      />,
    )
    await user.click(screen.getByText('María López'))
    expect(mockOnAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
  })

  it('NO tiene onEventDrop (sin drag-and-drop)', () => {
    // El componente usa Calendar (no DragAndDropCalendar) — renderiza sin errores
    render(
      <CalendarViewRangeReadOnly
        view="month"
        date="2026-05-01"
        appointments={[BASE_APPOINTMENT]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    expect(screen.getByTestId('rbc-calendar')).toBeInTheDocument()
  })
})

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

  describe('Story 10.7 — Huecos libres y resumen de mes', () => {
    const FREE_SHIFT = {
      open: '08:00',
      close: '08:30',
      slot_start_iso: '2026-05-14T11:00:00Z',
      slot_end_iso: '2026-05-14T11:30:00Z',
      service_id: 'svc-1',
      service_name: 'Kinesiología',
      require_referral: false,
      professional_id: 'prof-1',
      professional_name: 'Dra. Pérez',
    }

    it('vista semana pinta huecos libres clickeables en la columna correcta', async () => {
      const user = userEvent.setup()
      const onFreeSlotClick = vi.fn()
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShiftsByDate={{ '2026-05-14': [FREE_SHIFT] }}
          onFreeSlotClick={onFreeSlotClick}
        />,
      )
      const slotBtn = screen.getByRole('button', { name: /agendar a las 08:00 con dra\. pérez/i })
      expect(slotBtn).toBeInTheDocument()
      await user.click(slotBtn)
      expect(onFreeSlotClick).toHaveBeenCalledWith(FREE_SHIFT)
    })

    it('vista mes muestra "● N libres" desde availabilitySummary', () => {
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          availabilitySummary={{ '2026-05-14': { free_count: 5 } }}
        />,
      )
      expect(screen.getByTestId('month-availability-summary')).toBeInTheDocument()
      expect(screen.getByText(/● 5 libres/)).toBeInTheDocument()
    })

    it('vista mes: click en un día llama onDayClick con la fecha', async () => {
      const user = userEvent.setup()
      const onDayClick = vi.fn()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          availabilitySummary={{ '2026-05-14': { free_count: 5 } }}
          onDayClick={onDayClick}
        />,
      )
      await user.click(screen.getByRole('listitem', { name: /5 libres/i }))
      expect(onDayClick).toHaveBeenCalledWith('2026-05-14')
    })

    // Regresión Story 10.7 (hotfix key duplicada): dos servicios distintos del
    // MISMO profesional a la MISMA hora generaban la misma React key
    // ("Encountered two children with the same key") en la vista Semana
    // (WeekColumnsView). El fix agregó service_id + idx a la key.
    it('vista semana: dos huecos del mismo profesional/misma hora con service_id distinto NO emiten warning de key duplicada', () => {
      const shiftA: typeof FREE_SHIFT = {
        ...FREE_SHIFT,
        service_id: 'svc-A',
        service_name: 'Kinesiología',
      }
      const shiftB: typeof FREE_SHIFT = {
        ...FREE_SHIFT,
        service_id: 'svc-B',
        service_name: 'Fisioterapia',
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShiftsByDate={{ '2026-05-14': [shiftA, shiftB] }}
          onFreeSlotClick={vi.fn()}
        />,
      )

      // Se renderizan los DOS huecos clickeables (mismo aria-label: misma hora/prof).
      const slots = screen.getAllByRole('button', {
        name: /agendar a las 08:00 con dra\. pérez/i,
      })
      expect(slots).toHaveLength(2)

      // Y React NO emitió el warning de key duplicada.
      const duplicateKeyWarning = errorSpy.mock.calls.some((args) =>
        args.some(
          (a) =>
            typeof a === 'string' && (a.includes('same key') || a.includes('unique key')),
        ),
      )
      expect(duplicateKeyWarning).toBe(false)

      errorSpy.mockRestore()
    })
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

  // ── Badge "Sesión X/N" en vista Semana (Story 13.5) ─────────────────────────
  describe('badge de serie (paquetes)', () => {
    it('muestra "Sesión X/N" en la vista Semana para un turno con package_id + join', () => {
      const serieApt: Appointment = {
        ...BASE_APPOINTMENT,
        package_id: 'trt-1',
        session_index: 4,
        treatments: { total_sessions: 8, status: 'active' },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[serieApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByText('Sesión 4/8')).toBeInTheDocument()
    })

    it('NO muestra badge para un turno suelto (sin package_id) en la vista Semana', () => {
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
      expect(screen.queryByText(/^Sesión /)).not.toBeInTheDocument()
    })
  })
})

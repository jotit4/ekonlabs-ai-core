import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { format, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment } from '@/types/appointments'
import type { DayStatusEntry } from '@/types/holidays'

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

  it('renderiza 7 días DESDE la fecha ancla en vista Semana (ancla = primera columna)', () => {
    // La vista Semana ahora es una ventana de 7 días desde el ancla (date), no
    // la semana calendario. Las cabeceras usan formato "EEE d" (ej. "mar 12").
    // Los labels se computan del prop `date`, así el test es determinista
    // independientemente de la fecha real de ejecución.
    const anchor = '2026-05-12'
    render(
      <CalendarViewRangeReadOnly
        view="week"
        date={anchor}
        appointments={[]}
        isLoading={false}
        isError={false}
        onRefetch={mockOnRefetch}
      />,
    )
    const firstLabel = format(parseISO(anchor), 'EEE d', { locale: es }) // "mar 12"
    const lastLabel = format(addDays(parseISO(anchor), 6), 'EEE d', { locale: es }) // "lun 18"
    expect(screen.getByText(firstLabel)).toBeInTheDocument()
    expect(screen.getByText(lastLabel)).toBeInTheDocument()
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

  // ─── Filtro de estado en la agenda (decisión 2026-07-14) ───────────────────
  // Los CANCELADOS desaparecen de la grilla (Semana/Mes) — igual criterio que
  // la vista Día (CalendarView.tsx). Los no_show SÍ se siguen mostrando.
  describe('filtro de cancelados (no se muestran en la agenda)', () => {
    it('vista Mes: NO renderiza un evento para un turno cancelado', () => {
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-12"
          appointments={[{ ...BASE_APPOINTMENT, status: 'cancelled' }]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.queryByTestId('event-apt-1')).not.toBeInTheDocument()
    })

    it('vista Mes: SÍ renderiza un evento para un turno no_show', () => {
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-12"
          appointments={[{ ...BASE_APPOINTMENT, status: 'no_show' }]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByTestId('event-apt-1')).toBeInTheDocument()
    })

    it('vista Semana: NO muestra un turno cancelado', () => {
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[{ ...BASE_APPOINTMENT, status: 'cancelled' }]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.queryByText('María López')).not.toBeInTheDocument()
    })

    it('vista Semana: SÍ muestra un turno no_show', () => {
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[{ ...BASE_APPOINTMENT, status: 'no_show' }]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByText('María López')).toBeInTheDocument()
    })
  })

  // ─── Celda vacía → atajo "Dar un turno" (pedido ISADI 2026-07-14) ──────────
  // Los huecos libres ("N libres" / chip individual) y el resumen "● N libres"
  // del mes se retiraron del calendario. El atajo "click en hueco → Nuevo turno
  // prellenado" se preserva en la vista Semana, ahora disparado por la CELDA
  // VACÍA de la grilla (columna = día, ya no hay datos de disponibilidad para
  // anunciar profesional/servicio). La vista Mes no tiene grilla de celdas
  // propia (usa react-big-calendar) y el click-en-día que antes ofrecían las
  // tarjetas de disponibilidad no tiene reemplazo — se retira junto con ellas.
  describe('celda vacía → atajo "Dar un turno" (vista Semana)', () => {
    // El accesible name incluye la etiqueta de columna ("— jue 14") porque los
    // OTROS 6 días de la semana, sin ningún turno, quedan con TODAS sus horas
    // del rango default clickeables también — sin la etiqueta, 7 botones
    // compartirían el mismo nombre "Dar un turno a las 10:00" (ambiguo para
    // getByRole y para lectores de pantalla).
    it('una celda vacía dentro del horario activo del día es clickeable y llama onEmptyCellClick', async () => {
      const user = userEvent.setup()
      const onEmptyCellClick = vi.fn()
      // Dos turnos el mismo día (09:00 y 11:00) → la ventana activa de esa
      // columna (14/05, "jue 14") deja la celda 10:00 vacía y dentro del horario.
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onEmptyCellClick={onEmptyCellClick}
        />,
      )
      const emptyCellBtn = screen.getByRole('button', { name: /dar un turno a las 10:00 — jue 14/i })
      await user.click(emptyCellBtn)
      // colId de la vista Semana YA es la fecha ISO del día → se pasa directo.
      expect(onEmptyCellClick).toHaveBeenCalledWith('2026-05-14', '10:00')
    })

    it('sin onEmptyCellClick, la celda vacía no rompe el render', () => {
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(
        screen.getByRole('button', { name: /dar un turno a las 10:00 — jue 14/i }),
      ).toBeInTheDocument()
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

  // ─── Feriados + estado del día (pedido ISADI 2026-07-14) ───────────────────
  describe('estado del día (feriados + decisión de la clínica) en vista Semana', () => {
    it('sin dayStatusMap (prop no pasada) → no renderiza la fila de estado del día', () => {
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
      expect(screen.queryByRole('row', { name: 'Estado de los días de la semana' })).not.toBeInTheDocument()
    })

    it('con dayStatusMap, un día feriado sin decisión → muestra el badge con el nombre del feriado', () => {
      // El ancla 2026-05-12 es un martes → jue 14 es el 3er día de la ventana.
      const dayStatusMap: Record<string, DayStatusEntry> = {
        '2026-05-14': {
          date: '2026-05-14',
          isHoliday: true,
          holidayName: 'Día de Prueba',
          decisionIsOpen: null,
          decidedByName: null,
          decidedAt: null,
          reason: null,
          effectiveOpen: false,
        },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          dayStatusMap={dayStatusMap}
        />,
      )
      expect(screen.getByRole('row', { name: 'Estado de los días de la semana' })).toBeInTheDocument()
      expect(screen.getByText(/Día de Prueba/)).toBeInTheDocument()
    })

    it('click en el badge del día llama onDayStatusClick con la fecha ISO de esa columna', async () => {
      const user = userEvent.setup()
      const onDayStatusClick = vi.fn()
      const dayStatusMap: Record<string, DayStatusEntry> = {
        '2026-05-14': {
          date: '2026-05-14',
          isHoliday: true,
          holidayName: 'Día de Prueba',
          decisionIsOpen: null,
          decidedByName: null,
          decidedAt: null,
          reason: null,
          effectiveOpen: false,
        },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          dayStatusMap={dayStatusMap}
          onDayStatusClick={onDayStatusClick}
        />,
      )
      await user.click(screen.getByText(/Día de Prueba/))
      expect(onDayStatusClick).toHaveBeenCalledWith('2026-05-14')
    })

    it('un día CERRADO ya no ofrece "Dar un turno" en su hueco (celda deja de ser clickeable)', () => {
      // Dos turnos el mismo día (09:00 y 11:00) → sin el cierre, el hueco de
      // las 10:00 sería clickeable (mismo fixture que el test de arriba
      // "celda vacía → atajo Dar un turno"). Con el día CERRADO, ese mismo
      // hueco debe pasar a no-clickeable (outOfHours), no seguir ofreciendo
      // "Dar un turno".
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
      }
      const dayStatusMap: Record<string, DayStatusEntry> = {
        '2026-05-14': {
          date: '2026-05-14',
          isHoliday: true,
          holidayName: 'Día de Prueba',
          decisionIsOpen: null,
          decidedByName: null,
          decidedAt: null,
          reason: null,
          effectiveOpen: false,
        },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onEmptyCellClick={vi.fn()}
          dayStatusMap={dayStatusMap}
        />,
      )
      // Los turnos YA agendados ese día se siguen mostrando (no se ocultan).
      expect(screen.getAllByText('María López')).toHaveLength(2)
      // Pero el hueco de las 10:00 (que sin el cierre sería clickeable) ya NO
      // ofrece "Dar un turno" en el día cerrado.
      expect(
        screen.queryByRole('button', { name: /dar un turno a las 10:00 — jue 14/i }),
      ).not.toBeInTheDocument()
    })

    it('un día ABIERTO (decisión explícita "abre") SÍ sigue ofreciendo "Dar un turno" (no rompe el comportamiento existente)', () => {
      // Dos turnos el mismo día (09:00 y 11:00) para que exista un hueco
      // (10:00) DENTRO de la ventana activa — mismo fixture que el test
      // "celda vacía → atajo Dar un turno" de arriba.
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
      }
      const dayStatusMap: Record<string, DayStatusEntry> = {
        '2026-05-14': {
          date: '2026-05-14',
          isHoliday: false,
          holidayName: null,
          decisionIsOpen: true,
          decidedByName: 'Ana',
          decidedAt: '2026-05-01T00:00:00.000Z',
          reason: null,
          effectiveOpen: true,
        },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onEmptyCellClick={vi.fn()}
          dayStatusMap={dayStatusMap}
        />,
      )
      expect(
        screen.getByRole('button', { name: /dar un turno a las 10:00 — jue 14/i }),
      ).toBeInTheDocument()
    })
  })
})

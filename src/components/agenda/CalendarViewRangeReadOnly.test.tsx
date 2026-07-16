import { render, screen, within } from '@testing-library/react'
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
      date?: Date
      onSelectEvent?: (e: unknown) => void
      onKeyPressEvent?: (e: unknown, keyboardEvent: React.KeyboardEvent<HTMLElement>) => void
      onShowMore?: (events: unknown[], date: Date) => void
      showAllEvents?: boolean
      popup?: boolean
      doShowMoreDrillDown?: boolean
      messages?: { showMore?: (total: number) => string }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components?: any
    }) => {
      // Renderiza también `components.month.dateHeader` para el día ancla
      // (`props.date`) — el mock real de RBC pintaría uno por cada celda del
      // mes, pero para testear el click en el número del día alcanza con
      // exponer uno solo (drilldownView=null, como en producción — ver
      // MonthDayStatusHeader.tsx: `views={[Views.MONTH]}` nunca habilita
      // drilldown).
      const DateHeaderComponent = props.components?.month?.dateHeader
      const dateHeader =
        DateHeaderComponent && props.date
          ? React.createElement(DateHeaderComponent, {
              key: 'date-header',
              label: String(props.date.getDate()),
              date: props.date,
              drilldownView: null,
              isOffRange: false,
              onDrillDown: () => {},
            })
          : null
      const DateCellWrapper = props.components?.dateCellWrapper
      const dateBackground =
        DateCellWrapper && props.date
          ? React.createElement(
              DateCellWrapper,
              { key: 'date-background', value: props.date, range: [props.date] },
              React.createElement('div', { 'data-testid': 'month-day-background' }),
            )
          : null
      const offRangeDate = props.date
        ? new Date(props.date.getFullYear(), props.date.getMonth() - 1, 15)
        : null
      const offRangeBackground =
        DateCellWrapper && offRangeDate
          ? React.createElement(
              DateCellWrapper,
              { key: 'off-range-background', value: offRangeDate, range: [offRangeDate] },
              React.createElement('div', { 'data-testid': 'month-off-range-background' }),
            )
          : null

      // Simula el overflow por FECHA de RBC: solo oculta a partir del tercer
      // turno de un mismo día y entrega `onShowMore` únicamente el subconjunto
      // oculto. Así la prueba demuestra que producción recalcula el día entero.
      const eventsByDate = new Map<string, unknown[]>()
      for (const event of props.events) {
        const start = (event as { start?: Date }).start
        if (!(start instanceof Date)) continue
        const dateKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
        const group = eventsByDate.get(dateKey) ?? []
        group.push(event)
        eventsByDate.set(dateKey, group)
      }
      const overflowGroup =
        props.showAllEvents === false
          ? [...eventsByDate.values()].find((group) => group.length > 2)
          : undefined
      const hiddenEvents = overflowGroup?.slice(2) ?? []
      const visibleEvents = hiddenEvents.length
        ? props.events.filter((event) => !hiddenEvents.includes(event))
        : props.events
      const hiddenCount = hiddenEvents.length
      const showMoreDate = (overflowGroup?.[0] as { start?: Date } | undefined)?.start
      const showMore =
        hiddenCount > 0 && showMoreDate
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'rbc-show-more',
                onClick: () => props.onShowMore?.(hiddenEvents, showMoreDate),
              },
              props.messages?.showMore?.(hiddenCount) ?? `+${hiddenCount}`,
            )
          : null
      return React.createElement(
        'div',
        {
          'data-testid': 'rbc-calendar',
          'data-show-all-events': String(props.showAllEvents),
          'data-popup': String(props.popup),
          'data-show-more-drilldown': String(props.doShowMoreDrillDown),
        },
        dateBackground,
        offRangeBackground,
        dateHeader,
        visibleEvents.map((e: unknown) => {
          const ev = e as {
            id: string
            title: string
            start: Date
            resource: Appointment
          }
          const eventNode = React.createElement(
            'div',
            {
              key: ev.id,
              className: 'rbc-event',
              'data-testid': `event-${ev.id}`,
              onClick: () => props.onSelectEvent?.(ev),
              onKeyDown: (keyboardEvent: React.KeyboardEvent<HTMLElement>) =>
                props.onKeyPressEvent?.(ev, keyboardEvent),
            },
            props.components?.event ? props.components.event({ event: ev }) : ev.title,
          )
          const EventWrapper = props.components?.eventWrapper
          return EventWrapper
            ? React.createElement(EventWrapper, { key: ev.id, event: ev }, eventNode)
            : eventNode
        }),
        showMore,
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

  // ─── Clic en el encabezado del día → modal con todos los turnos (pedido
  // ISADI 2026-07-14: la agenda se ve apretada con varios turnos el mismo
  // día, permitir abrir el día completo desde el encabezado) ─────────────────
  describe('clic en el encabezado del día abre el modal con los turnos de ese día', () => {
    it('vista Semana: click en el encabezado de un día abre el modal con TODOS los turnos de ese día', async () => {
      const user = userEvent.setup()
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
        patients: { full_name: 'Carlos Ruiz' },
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
      // 2026-05-14 es jueves → fullLabel = "jueves 14".
      await user.click(screen.getByRole('button', { name: /ver turnos del jueves 14/i }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('2 turnos')).toBeInTheDocument()
      expect(within(dialog).getByText('María López')).toBeInTheDocument()
      expect(within(dialog).getByText('Carlos Ruiz')).toBeInTheDocument()
    })

    it('vista Semana: el modal se cierra con el botón "Cerrar"', async () => {
      const user = userEvent.setup()
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
      await user.click(screen.getByRole('button', { name: /ver turnos del jueves 14/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /cerrar/i }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('vista Semana: click en un turno DENTRO del modal llama onAppointmentClick', async () => {
      const user = userEvent.setup()
      const onAppointmentClick = vi.fn()
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onAppointmentClick={onAppointmentClick}
        />,
      )
      await user.click(screen.getByRole('button', { name: /ver turnos del jueves 14/i }))
      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByText('María López'))
      expect(onAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
    })

    it('vista Mes: click en el número del día abre el modal con los turnos de ese día', async () => {
      const user = userEvent.setup()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      await user.click(screen.getByRole('button', { name: /ver turnos del jueves 14/i }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('María López')).toBeInTheDocument()
    })
  })

  describe('vista Mes: celdas consultables y resumen de densidad', () => {
    it('click en el fondo completo abre el modal del día con todos sus turnos', async () => {
      const user = userEvent.setup()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )

      await user.click(screen.getByTestId('month-day-background'))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('1 turno')).toBeInTheDocument()
      expect(within(dialog).getByText('María López')).toBeInTheDocument()
    })

    it('click en el fondo de un día vacío abre un modal con 0 turnos', async () => {
      const user = userEvent.setup()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )

      await user.click(screen.getByTestId('month-day-background'))

      expect(within(screen.getByRole('dialog')).getByText('0 turnos')).toBeInTheDocument()
    })

    it('el fondo no agrega un control ni un tab stop; el número conserva el acceso por teclado', () => {
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      const dayBackground = screen.getByTestId('month-day-background').parentElement

      expect(dayBackground).not.toHaveAttribute('role')
      expect(dayBackground).not.toHaveAttribute('tabindex')
      expect(
        screen.getByRole('button', { name: /ver turnos del jueves 14/i }),
      ).toBeInTheDocument()
    })

    it('el fondo de una fecha fuera del mes conserva la celda pero no abre el modal', async () => {
      const user = userEvent.setup()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      const offRangeCell = screen.getByTestId('month-off-range-background').parentElement

      expect(offRangeCell).toHaveClass('rbc-month-day-wrapper--off-range')
      expect(offRangeCell).not.toHaveClass('rbc-month-day-hitarea')
      await user.click(screen.getByTestId('month-off-range-background'))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('click en un turno abre su detalle sin abrir también el modal del día', async () => {
      const user = userEvent.setup()
      const onAppointmentClick = vi.fn()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onAppointmentClick={onAppointmentClick}
        />,
      )

      await user.click(screen.getByTestId('event-apt-1'))

      expect(onAppointmentClick).toHaveBeenCalledOnce()
      expect(onAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it.each([
      ['Enter', '{Enter}'],
      ['Espacio', ' '],
    ])('%s enfoca y abre el turno exactamente una vez', async (_label, key) => {
      const user = userEvent.setup()
      const onAppointmentClick = vi.fn()
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onAppointmentClick={onAppointmentClick}
        />,
      )
      const eventControl = screen.getByRole('button', {
        name: /abrir turno de María López a las 09:00/i,
      })

      // Número y badge del día son los dos controles previos del header.
      await user.tab()
      await user.tab()
      await user.tab()
      expect(eventControl).toHaveFocus()
      await user.keyboard(key)

      expect(onAppointmentClick).toHaveBeenCalledOnce()
      expect(onAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('usa chips de una línea y configura el excedente sin popup ni drilldown', () => {
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )

      const compactSummary = screen
        .getByTestId('event-apt-1')
        .querySelector('.rbc-month-event-text')
      expect(compactSummary).toHaveTextContent('09:00 · María López')
      expect(screen.queryByText('Dr. Pérez')).not.toBeInTheDocument()
      expect(screen.getByTestId('rbc-calendar')).toHaveAttribute('data-show-all-events', 'false')
      expect(screen.getByTestId('rbc-calendar')).toHaveAttribute('data-popup', 'false')
      expect(screen.getByTestId('rbc-calendar')).toHaveAttribute(
        'data-show-more-drilldown',
        'false',
      )
    })

    it('muestra "+N turnos" y abre el modal con visibles y ocultos', async () => {
      const user = userEvent.setup()
      const apt2: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-14T10:00:00',
        end_at: '2026-05-14T11:00:00',
        patients: { full_name: 'Carlos Ruiz' },
      }
      const apt3: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-3',
        start_at: '2026-05-14T11:00:00',
        end_at: '2026-05-14T12:00:00',
        patients: { full_name: 'Elena Sosa' },
      }
      render(
        <CalendarViewRangeReadOnly
          view="month"
          date="2026-05-14"
          appointments={[BASE_APPOINTMENT, apt2, apt3]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )

      expect(screen.queryByText('Elena Sosa')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '+1 turno' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('3 turnos')).toBeInTheDocument()
      expect(within(dialog).getByText('María López')).toBeInTheDocument()
      expect(within(dialog).getByText('Carlos Ruiz')).toBeInTheDocument()
      expect(within(dialog).getByText('Elena Sosa')).toBeInTheDocument()
    })
  })

  // ─── Superposición: celda con muchos turnos cap-ea a "+N más" (Semana) ────
  describe('celda con muchos turnos en la misma franja (Semana) cap-ea a "+N más"', () => {
    it('con 3 turnos en la misma franja, solo se ven 2 chips + botón "+1 más"', () => {
      const apt2: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-14T09:15:00',
        end_at: '2026-05-14T09:45:00',
        patients: { full_name: 'Carlos Ruiz' },
      }
      const apt3: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-3',
        start_at: '2026-05-14T09:30:00',
        end_at: '2026-05-14T10:00:00',
        patients: { full_name: 'Elena Sosa' },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, apt2, apt3]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByText('María López')).toBeInTheDocument()
      expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
      expect(screen.queryByText('Elena Sosa')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ver 1 turno más de jue 14/i })).toBeInTheDocument()
    })

    it('click en "+N más" abre el modal con TODOS los turnos del día (incluido el que estaba oculto)', async () => {
      const user = userEvent.setup()
      const apt2: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-14T09:15:00',
        end_at: '2026-05-14T09:45:00',
        patients: { full_name: 'Carlos Ruiz' },
      }
      const apt3: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-3',
        start_at: '2026-05-14T09:30:00',
        end_at: '2026-05-14T10:00:00',
        patients: { full_name: 'Elena Sosa' },
      }
      render(
        <CalendarViewRangeReadOnly
          view="week"
          date="2026-05-12"
          appointments={[BASE_APPOINTMENT, apt2, apt3]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      await user.click(screen.getByRole('button', { name: /ver 1 turno más de jue 14/i }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('3 turnos')).toBeInTheDocument()
      expect(within(dialog).getByText('María López')).toBeInTheDocument()
      expect(within(dialog).getByText('Carlos Ruiz')).toBeInTheDocument()
      expect(within(dialog).getByText('Elena Sosa')).toBeInTheDocument()
    })

    it('con 2 turnos o menos en la franja, NO aparece el botón "+N más"', () => {
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
      expect(screen.queryByText(/más$/)).not.toBeInTheDocument()
    })
  })
})

import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// Mock CSS imports
vi.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}))
vi.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}))

// Objeto compartido para capturar callbacks del Calendar mock
// Usado como objeto (no variable primitiva) para evitar problemas con el closure del mock hoisted
const calendarMockRef = { onEventDrop: undefined as ((args: unknown) => void) | undefined }

// Mock react-big-calendar
vi.mock('react-big-calendar', async () => {
  const React = await import('react')
  return {
    Calendar: (props: {
      events: unknown[]
      onEventDrop?: (args: unknown) => void
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components?: any
    }) => {
      // Capturar onEventDrop para los tests
      calendarMockRef.onEventDrop = props.onEventDrop

      return React.createElement('div', { 'data-testid': 'rbc-calendar' },
        props.events.map((e: unknown) => {
          const ev = e as { id: string; title: string; resource: Appointment }
          return React.createElement('div', { key: ev.id, 'data-testid': `event-${ev.id}` },
            props.components?.event
              ? props.components.event({ event: ev })
              : ev.title
          )
        })
      )
    },
    dateFnsLocalizer: () => ({}),
    Views: { DAY: 'day' },
  }
})

// Mock DnD addon — identity function (withDragAndDrop devuelve el mismo Calendar)
vi.mock('react-big-calendar/lib/addons/dragAndDrop', async () => {
  return {
    // default es la función withDragAndDrop — identity para tests
    default: (Cal: React.ComponentType) => Cal,
    __esModule: true,
  }
})

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
      Close: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
        React.createElement('button', { type: 'button', onClick }, children),
    },
  }
})

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Mock date-fns/locale
vi.mock('date-fns/locale', () => ({ es: {} }))

// Mock sonner
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Importar CalendarView después de que todos los mocks estén configurados
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

const BASE_CALENDAR_EVENT = {
  id: 'apt-1',
  title: 'Juan García · Kinesiología',
  start: new Date('2026-05-07T09:00:00'),
  end: new Date('2026-05-07T10:00:00'),
  resource: BASE_APPOINTMENT,
}

const mockOnRefetch = vi.fn()

describe('CalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calendarMockRef.onEventDrop = undefined
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
  })

  describe('renderizado básico', () => {
    it('renderiza el calendario sin error cuando appointments está vacío', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
        />
      )
      expect(screen.getByTestId('rbc-calendar')).toBeInTheDocument()
    })

    it('muestra skeleton cuando isLoading=true', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={true}
          isError={false}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
        />
      )
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
      expect(screen.queryByTestId('rbc-calendar')).not.toBeInTheDocument()
    })

    it('muestra error con botón Reintentar cuando isError=true', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={true}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
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
          gcalStatus="healthy"
        />
      )
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockOnRefetch).toHaveBeenCalledOnce()
    })
  })

  describe('mapeo de appointments a CalendarEvents', () => {
    it('mapea appointments correctamente a eventos del calendario', async () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
        />
      )
      await waitFor(() => {
        expect(screen.getByTestId('event-apt-1')).toBeInTheDocument()
      })
    })

    it('muestra el título del evento con nombre de paciente y servicio', async () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
        />
      )
      await waitFor(() => {
        expect(screen.getByText(/Juan García/)).toBeInTheDocument()
        expect(screen.getByText(/Kinesiología/)).toBeInTheDocument()
      })
    })
  })

  describe('drag-and-drop con optimistic update', () => {
    async function renderAndSimulateDrop() {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          gcalStatus="healthy"
        />
      )

      // Esperar que el Calendar monte con onEventDrop disponible
      await waitFor(() => {
        expect(calendarMockRef.onEventDrop).toBeDefined()
      })

      // Simular drop — llamar onEventDrop directamente
      await act(async () => {
        calendarMockRef.onEventDrop?.({
          event: BASE_CALENDAR_EVENT,
          start: new Date('2026-05-07T15:00:00'),
          end: new Date('2026-05-07T16:00:00'),
        })
      })
    }

    it('abre el modal de confirmación cuando se hace drop', async () => {
      await renderAndSimulateDrop()

      await waitFor(() => {
        expect(screen.getByTestId('dialog-root')).toBeInTheDocument()
      })
      // El modal muestra título y botones de confirmación
      expect(screen.getByRole('heading', { name: /reprogramar turno/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })

    it('llama a la API PATCH al confirmar el drop', async () => {
      await renderAndSimulateDrop()
      await screen.findByTestId('dialog-root')

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /confirmar/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments/apt-1',
          expect.objectContaining({ method: 'PATCH' })
        )
      })
    })

    it('cancela el drop y cierra el modal sin llamar a la API', async () => {
      await renderAndSimulateDrop()
      await screen.findByTestId('dialog-root')

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /cancelar/i }))

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-root')).not.toBeInTheDocument()
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('callback onReschedule', () => {
    it('llama onReschedule cuando se hace click en el botón del evento', async () => {
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
          gcalStatus="healthy"
        />
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/reprogramar turno de juan garcía/i)).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText(/reprogramar turno de juan garcía/i))
      expect(mockOnReschedule).toHaveBeenCalledWith(BASE_APPOINTMENT)
    })
  })
})

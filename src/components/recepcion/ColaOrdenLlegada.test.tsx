import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { format, parseISO } from 'date-fns'
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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Estado mutable de la cola devuelta por el hook (se cambia entre tests).
let mockQueue: Appointment[] = []
const mockRefetch = vi.fn()
let mockIsLoading = false
let mockIsError = false
// Instante del último dato del servidor: las marcas optimistas caducan cuando
// llega un dato POSTERIOR a ellas.
let mockDataUpdatedAt = 0

vi.mock('@/hooks/use-walk-in-queue', () => ({
  useWalkInQueue: vi.fn(() => ({
    queue: mockQueue,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: mockRefetch,
    dataUpdatedAt: mockDataUpdatedAt,
  })),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { ColaOrdenLlegada } from './ColaOrdenLlegada'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PAST = '2026-07-17T09:00:00-03:00'

// Tres horas de llegada distintas y crecientes: el hook devuelve la cola en
// ORDEN DE LLEGADA (start_at asc) y la UI la muestra invertida (LIFO).
const LLEGADA_1 = '2026-07-17T09:00:00-03:00'
const LLEGADA_2 = '2026-07-17T09:30:00-03:00'
const LLEGADA_3 = '2026-07-17T10:15:00-03:00'

/** Misma fórmula que el componente: evita depender del TZ del runner. */
const hhmm = (iso: string) => format(parseISO(iso), 'HH:mm')

function apt(overrides: Partial<Appointment>): Appointment {
  return {
    appointment_id: 'apt-1',
    tenant_id: 'tenant-1',
    phone_number: '',
    patient_id: 'pat-1',
    service_id: 'svc-walkin',
    professional_id: 'prof-1',
    appointment_time: PAST,
    start_at: PAST,
    end_at: PAST,
    status: 'confirmed',
    calendar_event_id: null,
    created_at: PAST,
    reminder_sent_at: null,
    attendance_confirmed: null,
    is_walk_in: true,
    patients: { full_name: 'Ana García' },
    services: null,
    professionals: null,
    ...overrides,
  } as Appointment
}

function renderCola() {
  return render(
    <ColaOrdenLlegada serviceId="svc-walkin" professionalId="prof-1" hoyISO="2026-07-17" />,
  )
}

describe('ColaOrdenLlegada — Story 16.1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueue = []
    mockIsLoading = false
    mockIsError = false
    mockDataUpdatedAt = 0
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/patients/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              patients: [
                {
                  patient_id: 'pat-9',
                  full_name: 'Carlos Ruiz',
                  phone_number: '+540000000',
                  obra_social: null,
                  deletion_requested_at: null,
                },
              ],
            }),
        })
      }
      if (typeof url === 'string' && url.includes('/api/appointments/walk-in')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ success: true, appointment_id: 'apt-new' }),
        })
      }
      // PATCH status
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
    })
  })

  // Pedido ISADI 2026-07-24: el bloque "Esperando" es LIFO — el ÚLTIMO que
  // llegó va arriba de todo — pero el NÚMERO sigue siendo el orden de llegada
  // real (el primero que llegó es el 1, aunque se vea abajo).
  it('ordena "Esperando" en LIFO pero numera por orden de llegada real', () => {
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', start_at: LLEGADA_1, patients: { full_name: 'Ana García' } }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', start_at: LLEGADA_2, patients: { full_name: 'Beto Sosa' } }),
      apt({ appointment_id: 'apt-3', patient_id: 'p3', start_at: LLEGADA_3, patients: { full_name: 'Carla Pérez' } }),
    ]
    renderCola()

    expect(screen.getByText('3 esperando')).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    // Visualmente: el último en llegar arriba…
    expect(within(items[0]).getByText('Carla Pérez')).toBeInTheDocument()
    expect(within(items[1]).getByText('Beto Sosa')).toBeInTheDocument()
    expect(within(items[2]).getByText('Ana García')).toBeInTheDocument()
    // …pero el número es el de llegada: Ana (la primera) sigue siendo la 1.
    expect(within(items[0]).getByText('3')).toBeInTheDocument()
    expect(within(items[1]).getByText('2')).toBeInTheDocument()
    expect(within(items[2]).getByText('1')).toBeInTheDocument()
  })

  it('muestra la hora de llegada en 24h (HH:mm) en cada fila', () => {
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', start_at: LLEGADA_1, patients: { full_name: 'Ana García' } }),
    ]
    renderCola()

    const item = screen.getAllByRole('listitem')[0]
    expect(within(item).getByText(new RegExp(`Llegó ${hhmm(LLEGADA_1)}`))).toBeInTheDocument()
  })

  // Los atendidos ya NO desaparecen: bajan a su propio bloque.
  it('separa la cola en dos bloques: "Esperando" arriba y "Atendidos" abajo', () => {
    mockQueue = [
      apt({
        appointment_id: 'apt-1',
        patient_id: 'p1',
        start_at: LLEGADA_1,
        status: 'completed',
        patients: { full_name: 'Ana García' },
      }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', start_at: LLEGADA_2, patients: { full_name: 'Beto Sosa' } }),
      apt({ appointment_id: 'apt-3', patient_id: 'p3', start_at: LLEGADA_3, patients: { full_name: 'Carla Pérez' } }),
    ]
    renderCola()

    // Encabezados de bloque visibles
    expect(screen.getByRole('heading', { name: /esperando/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /atendidos/i })).toBeInTheDocument()

    const esperandoList = screen.getByRole('list', { name: 'Pacientes esperando' })
    const atendidosList = screen.getByRole('list', { name: 'Pacientes atendidos' })

    const esperandoItems = within(esperandoList).getAllByRole('listitem')
    expect(esperandoItems).toHaveLength(2)
    expect(within(esperandoItems[0]).getByText('Carla Pérez')).toBeInTheDocument()
    expect(within(esperandoItems[1]).getByText('Beto Sosa')).toBeInTheDocument()

    // Ana sigue visible (antes desaparecía) con su número de llegada y su hora
    const atendidosItems = within(atendidosList).getAllByRole('listitem')
    expect(atendidosItems).toHaveLength(1)
    expect(within(atendidosItems[0]).getByText('Ana García')).toBeInTheDocument()
    expect(within(atendidosItems[0]).getByText('1')).toBeInTheDocument()
    expect(
      within(atendidosItems[0]).getByText(new RegExp(`Llegó ${hhmm(LLEGADA_1)}`)),
    ).toBeInTheDocument()
    // Sin botón de acción: ya fue atendido
    expect(within(atendidosItems[0]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('el contador "N esperando" NO cuenta a los atendidos', () => {
    mockQueue = [
      apt({
        appointment_id: 'apt-1',
        patient_id: 'p1',
        start_at: LLEGADA_1,
        status: 'completed',
        patients: { full_name: 'Ana García' },
      }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', start_at: LLEGADA_2, patients: { full_name: 'Beto Sosa' } }),
    ]
    renderCola()

    expect(screen.getByText('1 esperando')).toBeInTheDocument()
    expect(screen.getByLabelText('1 persona esperando')).toBeInTheDocument()
  })

  it('el bloque "Atendidos" también ordena LIFO (el último atendido, arriba)', () => {
    mockQueue = [
      apt({
        appointment_id: 'apt-1',
        patient_id: 'p1',
        start_at: LLEGADA_1,
        status: 'completed',
        patients: { full_name: 'Ana García' },
      }),
      apt({
        appointment_id: 'apt-2',
        patient_id: 'p2',
        start_at: LLEGADA_2,
        status: 'completed',
        patients: { full_name: 'Beto Sosa' },
      }),
      apt({ appointment_id: 'apt-3', patient_id: 'p3', start_at: LLEGADA_3, patients: { full_name: 'Carla Pérez' } }),
    ]
    renderCola()

    const atendidosList = screen.getByRole('list', { name: 'Pacientes atendidos' })
    const items = within(atendidosList).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Beto Sosa')).toBeInTheDocument()
    expect(within(items[1]).getByText('Ana García')).toBeInTheDocument()
  })

  it('con toda la cola atendida muestra el aviso de que no hay nadie esperando', () => {
    mockQueue = [
      apt({
        appointment_id: 'apt-1',
        patient_id: 'p1',
        start_at: LLEGADA_1,
        status: 'completed',
        patients: { full_name: 'Ana García' },
      }),
    ]
    renderCola()

    expect(screen.getByText('0 esperando')).toBeInTheDocument()
    expect(screen.getByText(/no hay nadie esperando/i)).toBeInTheDocument()
    // Pero el atendido sigue a la vista
    expect(screen.getByRole('list', { name: 'Pacientes atendidos' })).toBeInTheDocument()
    expect(screen.getByText('Ana García')).toBeInTheDocument()
  })

  it('estado vacío: 0 esperando y mensaje "No hay nadie esperando"', () => {
    mockQueue = []
    renderCola()
    expect(screen.getByText('0 esperando')).toBeInTheDocument()
    expect(screen.getByText(/no hay nadie esperando/i)).toBeInTheDocument()
  })

  // AC3 (Story 16.2) — el nombre del paciente enlaza a su ficha (/pacientes/[id]).
  // Beneficia por igual a /recepcion (16.1) y a /agenda (16.2): mismo componente.
  it('el nombre del paciente es un link a la ficha (/pacientes/[id])', () => {
    mockQueue = [apt({ appointment_id: 'apt-1', patient_id: 'pat-1', patients: { full_name: 'Ana García' } })]
    renderCola()
    const link = screen.getByRole('link', { name: 'Ana García' })
    expect(link).toHaveAttribute('href', '/pacientes/pat-1')
  })

  // El contador anuncia con un plural correcto para lectores de pantalla
  // (fix Low 16.1: antes el aria-label tenía un ternario muerto).
  it('el contador expone un aria-label pluralizado ("personas esperando" para N>1)', () => {
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', patients: { full_name: 'Ana' } }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', patients: { full_name: 'Beto' } }),
    ]
    renderCola()
    expect(screen.getByLabelText('2 personas esperando')).toBeInTheDocument()
  })

  it('el contador usa el singular "persona esperando" cuando hay 1', () => {
    mockQueue = [apt({ appointment_id: 'apt-1', patient_id: 'p1', patients: { full_name: 'Ana' } })]
    renderCola()
    expect(screen.getByLabelText('1 persona esperando')).toBeInTheDocument()
  })

  it('click en "Atendido" dispara PATCH status=completed e invalida la cola', async () => {
    const user = userEvent.setup()
    mockQueue = [apt({ appointment_id: 'apt-1', patients: { full_name: 'Ana García' } })]
    renderCola()

    await user.click(screen.getByRole('button', { name: /marcar a ana garcía como atendido/i }))

    const patchCall = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/api/appointments/apt-1/status'),
    )
    expect(patchCall).toBeDefined()
    expect(patchCall![1].method).toBe('PATCH')
    const body = JSON.parse(patchCall![1].body as string) as { status: string }
    expect(body.status).toBe('completed')

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['walk-in-queue'] }),
    )
  })

  // El cambio de fondo del pedido: la fila NO se va, BAJA al bloque de atendidos
  // (feedback optimista, antes de que el servidor devuelva status='completed').
  it('al marcar "Atendido" la fila no desaparece: baja al bloque de atendidos', async () => {
    const user = userEvent.setup()
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', start_at: LLEGADA_1, patients: { full_name: 'Ana García' } }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', start_at: LLEGADA_2, patients: { full_name: 'Beto Sosa' } }),
    ]
    renderCola()

    expect(screen.getByText('2 esperando')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Pacientes atendidos' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /marcar a ana garcía como atendido/i }))

    // Ana sigue en pantalla, ahora en el bloque de atendidos y con su número 1.
    const atendidosList = screen.getByRole('list', { name: 'Pacientes atendidos' })
    const atendidos = within(atendidosList).getAllByRole('listitem')
    expect(atendidos).toHaveLength(1)
    expect(within(atendidos[0]).getByText('Ana García')).toBeInTheDocument()
    expect(within(atendidos[0]).getByText('1')).toBeInTheDocument()

    // Y el contador baja a 1 (cuenta solo pendientes).
    expect(screen.getByText('1 esperando')).toBeInTheDocument()
    const esperandoList = screen.getByRole('list', { name: 'Pacientes esperando' })
    expect(within(esperandoList).getAllByRole('listitem')).toHaveLength(1)
    expect(within(esperandoList).getByText('Beto Sosa')).toBeInTheDocument()
  })

  // La marca optimista caduca sola: si llega un dato del servidor POSTERIOR a
  // ella y sigue diciendo 'confirmed', manda el servidor (la fila no se congela).
  it('la marca optimista no congela la fila si el servidor la sigue dando pendiente', async () => {
    const user = userEvent.setup()
    // Dato del servidor "más nuevo" que cualquier marca que hagamos ahora.
    mockDataUpdatedAt = Date.now() + 60_000
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', start_at: LLEGADA_1, patients: { full_name: 'Ana García' } }),
    ]
    renderCola()

    await user.click(screen.getByRole('button', { name: /marcar a ana garcía como atendido/i }))

    expect(screen.queryByRole('list', { name: 'Pacientes atendidos' })).not.toBeInTheDocument()
    expect(screen.getByText('1 esperando')).toBeInTheDocument()
  })

  it('si el PATCH falla, la fila vuelve al bloque "Esperando"', async () => {
    const user = userEvent.setup()
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'No se pudo marcar como atendido' }),
      }),
    )
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', start_at: LLEGADA_1, patients: { full_name: 'Ana García' } }),
    ]
    renderCola()

    await user.click(screen.getByRole('button', { name: /marcar a ana garcía como atendido/i }))

    expect(screen.queryByRole('list', { name: 'Pacientes atendidos' })).not.toBeInTheDocument()
    expect(screen.getByText('1 esperando')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /marcar a ana garcía como atendido/i }),
    ).toBeInTheDocument()
  })

  it('el mini-modal busca al paciente y postea el walk-in con service/professional fijos', async () => {
    const user = userEvent.setup()
    mockQueue = []
    renderCola()

    // Abrir el mini-modal
    await user.click(screen.getByRole('button', { name: /registrar llegada/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Buscar por DNI (autobúsqueda por debounce)
    await user.type(screen.getByLabelText(/dni del paciente/i), '30123456')

    // Aparece el paciente encontrado → confirmar alta
    const anotarBtn = await screen.findByRole('button', { name: /anotar en la cola/i })
    await user.click(anotarBtn)

    const postCall = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/api/appointments/walk-in'),
    )
    expect(postCall).toBeDefined()
    expect(postCall![1].method).toBe('POST')
    const body = JSON.parse(postCall![1].body as string) as {
      patient_id: string
      service_id: string
      professional_id: string
    }
    expect(body).toEqual({
      patient_id: 'pat-9',
      service_id: 'svc-walkin',
      professional_id: 'prof-1',
    })
  })

  it('el mini-modal muestra el aviso claro ante 409 already_in_queue', async () => {
    const user = userEvent.setup()
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/patients/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              patients: [
                {
                  patient_id: 'pat-9',
                  full_name: 'Carlos Ruiz',
                  phone_number: '',
                  obra_social: null,
                  deletion_requested_at: null,
                },
              ],
            }),
        })
      }
      // walk-in → 409 already_in_queue
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'already_in_queue' }),
      })
    })

    renderCola()
    await user.click(screen.getByRole('button', { name: /registrar llegada/i }))
    await user.type(screen.getByLabelText(/dni del paciente/i), '30123456')
    const anotarBtn = await screen.findByRole('button', { name: /anotar en la cola/i })
    await user.click(anotarBtn)

    expect(await screen.findByText(/este paciente ya está en la cola/i)).toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
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

vi.mock('@/hooks/use-walk-in-queue', () => ({
  useWalkInQueue: vi.fn(() => ({
    queue: mockQueue,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: mockRefetch,
  })),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { ColaOrdenLlegada } from './ColaOrdenLlegada'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PAST = '2026-07-17T09:00:00-03:00'

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

  it('muestra el contador "N esperando" y la lista ordenada con posiciones', () => {
    mockQueue = [
      apt({ appointment_id: 'apt-1', patient_id: 'p1', patients: { full_name: 'Ana García' } }),
      apt({ appointment_id: 'apt-2', patient_id: 'p2', patients: { full_name: 'Beto Sosa' } }),
    ]
    renderCola()

    expect(screen.getByText('2 esperando')).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Posición y nombre en orden de llegada
    expect(within(items[0]).getByText('1')).toBeInTheDocument()
    expect(within(items[0]).getByText('Ana García')).toBeInTheDocument()
    expect(within(items[1]).getByText('2')).toBeInTheDocument()
    expect(within(items[1]).getByText('Beto Sosa')).toBeInTheDocument()
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

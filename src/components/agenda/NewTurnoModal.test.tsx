import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewTurnoModal } from './NewTurnoModal'
import { patientSearchSchema } from '@/lib/schemas/appointment.schema'
import type { AvailabilityShift } from '@/types/availability'

// Reserva parcial de series x5/x10: aviso por toast (sonner, ya global) +
// navegación a la ficha del paciente ("Ir a completar").
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
import { toast } from 'sonner'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock del hook de disponibilidad: el modal pinta los horarios REALES libres
// (RPC check_clinic_availability vía useAvailability). En los tests devolvemos
// huecos controlados según servicio+profesional+fecha elegidos.
vi.mock('@/hooks/use-availability', () => ({
  useAvailability: vi.fn(),
}))
import { useAvailability } from '@/hooks/use-availability'

function makeShift(open: string): AvailabilityShift {
  return {
    open,
    close: open,
    slot_start_iso: `2026-05-15T12:00:00.000Z`,
    slot_end_iso: `2026-05-15T13:00:00.000Z`,
    service_id: 'svc-1',
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: 'prof-1',
    professional_name: 'Patricia Pérez',
  }
}

// Por defecto el hook ofrece 09:00–11:00 libres cuando hay servicio+profesional+
// fecha (enabled). Cuando enabled=false (falta algún dato) no hay huecos.
function mockAvailability(
  times: string[] = ['09:00', '10:00', '11:00'],
  opts: { isLoading?: boolean; isError?: boolean } = {},
) {
  vi.mocked(useAvailability).mockImplementation(({ enabled }) => {
    const shifts = enabled ? times.map(makeShift) : []
    return {
      daysShifts: {},
      daysSummary: {},
      isLoading: opts.isLoading ?? false,
      isError: opts.isError ?? false,
      refetch: vi.fn(),
      shiftsForDate: () => shifts,
    }
  })
}

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock @base-ui/react/dialog
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Backdrop: ({ className }: { className?: string }) => (
      <div data-testid="dialog-backdrop" className={className} />
    ),
    Popup: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div role="dialog" aria-modal="true" {...props}>
        {children}
      </div>
    ),
    Title: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
      <h2 id={id} className={className}>
        {children}
      </h2>
    ),
    Close: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode
      onClick?: () => void
      className?: string
    }) => (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    ),
  },
}))

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Mock @refinedev/core
// Nota P0.2: el mock ignora los `filters` del useList, así que incluimos un
// servicio 'cycle' para verificar que el filtro CLIENTE del modal (booking_mode
// === 'appointment') lo oculta.
vi.mock('@refinedev/core', () => ({
  useList: () => ({
    result: {
      data: [
        {
          service_id: 'svc-1',
          name: 'Kinesiología',
          professional_name: 'Patricia Pérez',
          duration_minutes: 60,
          booking_mode: 'appointment',
        },
        {
          service_id: 'svc-2',
          name: 'Fisioterapia',
          professional_name: null,
          duration_minutes: 30,
          booking_mode: 'appointment',
        },
        {
          service_id: 'svc-cycle',
          name: 'Aquagym',
          professional_name: null,
          duration_minutes: 60,
          booking_mode: 'cycle',
        },
      ],
    },
  }),
}))

const mockOnClose = vi.fn()

// Helpers para respuestas fetch
function makeSearchResponse(patients: object[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ patients }),
  }
}

function makeProfessionalsResponse(
  professionals: { professional_id: string; name: string }[] = [
    { professional_id: 'prof-1', name: 'Patricia Pérez' },
  ],
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: professionals }),
  }
}

function makeAppointmentResponse(ok = true, status = 201) {
  return {
    ok,
    status,
    json: async () => (ok ? { success: true, appointment_id: 'apt-new' } : { error: 'Error' }),
  }
}

// Ruteo de fetch por URL. Respuestas idempotentes: como la autobúsqueda por DNI
// puede disparar más de un fetch de búsqueda (dígitos parciales) además del Enter
// explícito, devolver siempre lo mismo hace los tests deterministas.
function setupFetch(
  opts: {
    search?: object[]
    searchError?: { status: number; error: string }
    professionals?: { professional_id: string; name: string }[]
    appointment?: { ok: boolean; status: number }
    createPatient?: { ok: boolean; status: number; patient_id?: string; error?: string }
  } = {},
) {
  const professionals = opts.professionals ?? [{ professional_id: 'prof-1', name: 'Patricia Pérez' }]
  const appointment = opts.appointment ?? { ok: true, status: 201 }
  mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
    if (url.includes('/api/patients/search')) {
      if (opts.searchError) {
        return Promise.resolve({
          ok: false,
          status: opts.searchError.status,
          json: async () => ({ error: opts.searchError!.error }),
        })
      }
      return Promise.resolve(makeSearchResponse(opts.search ?? []))
    }
    if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse(professionals))
    if (url === '/api/appointments' && init?.method === 'POST') {
      return Promise.resolve(makeAppointmentResponse(appointment.ok, appointment.status))
    }
    if (url === '/api/patients' && init?.method === 'POST') {
      const cp = opts.createPatient ?? { ok: true, status: 201, patient_id: 'pat-new' }
      return Promise.resolve({
        ok: cp.ok,
        status: cp.status,
        json: async () => (cp.ok ? { patient: { patient_id: cp.patient_id ?? 'pat-new' } } : { error: cp.error ?? 'Error' }),
      })
    }
    return Promise.resolve(makeSearchResponse([]))
  })
}

type User = ReturnType<typeof userEvent.setup>

// Dispara la búsqueda tipeando en el campo DNI + Enter (fallback determinista de
// la autobúsqueda). Sirve tanto para DNI como para búsqueda por nombre.
async function search(user: User, query: string) {
  const input = screen.getByLabelText('DNI del paciente')
  await user.clear(input)
  await user.type(input, `${query}{Enter}`)
}

describe('NewTurnoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: búsqueda sin resultados
    setupFetch({ search: [] })
    // Default: disponibilidad con 09:00–11:00 libres cuando se eligió servicio+profesional+fecha
    mockAvailability()
  })

  describe('renderizado', () => {
    it('renderiza el campo DNI cuando open=true', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByLabelText('DNI del paciente')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Ej: 30123456')).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(<NewTurnoModal open={false} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.queryByLabelText('DNI del paciente')).not.toBeInTheDocument()
    })

    it('tiene el título "Dar un turno"', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByText('Dar un turno')).toBeInTheDocument()
    })

    it('tiene el botón Cancelar', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })

    it('muestra el turno (servicio) de una y "Guardar turno" deshabilitado sin paciente', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      // El gate se eliminó: la columna del turno es visible desde el inicio.
      expect(screen.getByLabelText('Servicio')).toBeInTheDocument()
      expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
      expect(screen.getByLabelText('Horario')).toBeInTheDocument()
      // Pero no se puede guardar hasta identificar al paciente.
      expect(screen.getByRole('button', { name: /guardar turno/i })).toBeDisabled()
    })
  })

  describe('búsqueda e identificación del paciente', () => {
    const singlePatient = {
      patient_id: 'pat-uuid-1',
      full_name: 'María López',
      phone_number: '+5491111111111',
      obra_social: 'OSDE',
      deletion_requested_at: null,
    }

    it('autobusca por DNI (7-8 dígitos) sin apretar ningún botón', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      // Sólo tipear el DNI, sin Enter ni click: debe buscar solo.
      await user.type(screen.getByLabelText('DNI del paciente'), '30123456')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/patients/search?q=30123456'),
        )
        expect(screen.getByText(/María López/)).toBeInTheDocument()
      })
    })

    it('auto-selecciona y muestra los datos del paciente cuando hay 1 resultado', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '12345678')

      await waitFor(() => {
        expect(screen.getByText(/María López/)).toBeInTheDocument()
      })
      expect(screen.getByText(/OSDE/)).toBeInTheDocument()
    })

    it('muestra lista de opciones cuando hay múltiples resultados (búsqueda por nombre)', async () => {
      setupFetch({
        search: [
          { patient_id: 'pat-1', full_name: 'Juan García', phone_number: '+5491100000000', obra_social: null, deletion_requested_at: null },
          { patient_id: 'pat-2', full_name: 'Juan Pérez', phone_number: '+5491199999999', obra_social: 'OSDE', deletion_requested_at: null },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, 'Juan')

      await waitFor(() => {
        expect(screen.getByRole('list', { name: 'Resultados de búsqueda' })).toBeInTheDocument()
        expect(screen.getByText('Juan García')).toBeInTheDocument()
        expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
      })
    })

    it('selecciona paciente de la lista y muestra la tarjeta', async () => {
      setupFetch({
        search: [
          { patient_id: 'pat-1', full_name: 'Juan García', phone_number: '+5491100000000', obra_social: null, deletion_requested_at: null },
          { patient_id: 'pat-2', full_name: 'Juan Pérez', phone_number: '+5491199999999', obra_social: null, deletion_requested_at: null },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, 'Juan')

      await waitFor(() => {
        expect(screen.getByRole('list', { name: 'Resultados de búsqueda' })).toBeInTheDocument()
      })

      await user.click(screen.getAllByRole('listitem')[0])

      await waitFor(() => {
        // La lista desaparece y aparece la tarjeta del paciente (con el ✓).
        expect(screen.queryByRole('list', { name: 'Resultados de búsqueda' })).not.toBeInTheDocument()
        expect(screen.getByText(/✓ Juan García/)).toBeInTheDocument()
      })
      // Con paciente elegido, "Guardar turno" se habilita.
      expect(screen.getByRole('button', { name: /guardar turno/i })).toBeEnabled()
    })

    it('sin resultados por DNI: muestra el alta inline con el DNI precargado', async () => {
      setupFetch({ search: [] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '30123456')

      await waitFor(() => {
        expect(screen.getByText(/No hay ningún paciente con DNI 30123456/i)).toBeInTheDocument()
        expect(screen.getByText(/Nuevo paciente/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Nombre completo/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Teléfono/i)).toBeInTheDocument()
      })
      // El DNI ya viene cargado para no re-tipear.
      expect((screen.getByLabelText(/DNI \(opcional\)/i) as HTMLInputElement).value).toBe('30123456')
    })

    it('crea el paciente inline y lo deja seleccionado', async () => {
      setupFetch({ search: [], createPatient: { ok: true, status: 201, patient_id: 'pat-new' } })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '30123456')
      await waitFor(() => screen.getByText(/Nuevo paciente/i))

      await user.type(screen.getByLabelText(/Nombre completo/i), 'Pedro Nuevo')
      await user.type(screen.getByLabelText(/Teléfono/i), '2615551234')
      await user.click(screen.getByRole('button', { name: /crear paciente/i }))

      await waitFor(() => {
        expect(screen.getByText(/✓ Pedro Nuevo/)).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /guardar turno/i })).toBeEnabled()
    })

    it('muestra error de validación cuando la búsqueda es menor a 2 caracteres', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, 'a')

      await waitFor(() => {
        expect(screen.getByText(/Ingresá al menos 2 caracteres para buscar/)).toBeInTheDocument()
      })
    })

    it('muestra error si el paciente único tiene eliminación programada y no habilita guardar', async () => {
      setupFetch({
        search: [
          { patient_id: 'pat-uuid-2', full_name: 'Carlos Gómez', phone_number: '+5491122334455', obra_social: null, deletion_requested_at: '2026-05-11T00:00:00Z' },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '11223344')

      await waitFor(() => {
        expect(screen.getByText('Este paciente tiene una eliminación programada')).toBeInTheDocument()
      })

      // No se seleccionó paciente → "Guardar turno" sigue deshabilitado.
      expect(screen.getByRole('button', { name: /guardar turno/i })).toBeDisabled()
    })

    it('el botón "Cambiar" limpia el paciente seleccionado', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '30123456')
      await waitFor(() => screen.getByText(/María López/))

      await user.click(screen.getByRole('button', { name: /cambiar/i }))

      await waitFor(() => {
        expect(screen.queryByText(/María López/)).not.toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /guardar turno/i })).toBeDisabled()
    })
  })

  describe('formulario de turno', () => {
    const singlePatient = {
      patient_id: 'pat-uuid-1',
      full_name: 'María López',
      phone_number: '+5491111111111',
      obra_social: null,
      deletion_requested_at: null,
    }

    it('muestra los selectores de servicio, fecha y horario', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '87654321')

      await waitFor(() => {
        expect(screen.getByLabelText('Servicio')).toBeInTheDocument()
        expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
        expect(screen.getByLabelText('Horario')).toBeInTheDocument()
      })
    })

    it('habilita "Guardar turno" tras encontrar paciente', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await search(user, '87654321')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guardar turno/i })).toBeEnabled()
      })
    })

    it('envía appointment_time con offset -03:00 (fix C-05)', async () => {
      setupFetch({ search: [singlePatient], professionals: [{ professional_id: 'prof-1', name: 'Patricia Pérez' }] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      // Seleccionar servicio → dispara carga de profesionales
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      // Con un único profesional, se preselecciona automáticamente
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      await user.selectOptions(screen.getByLabelText('Horario'), '09:00')
      await user.click(screen.getByRole('button', { name: /guardar turno/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('-03:00'),
          }),
        )
      })
    })

    it('carga el selector de profesionales filtrado por servicio y por defecto "cualquiera" (P0.1)', async () => {
      setupFetch({
        search: [singlePatient],
        professionals: [
          { professional_id: 'prof-1', name: 'Patricia Pérez' },
          { professional_id: 'prof-2', name: 'Aldo Luque' },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-1/profesionales')
      })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Cualquier profesional disponible' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Patricia Pérez' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Aldo Luque' })).toBeInTheDocument()
      })
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('__any__')
      })
    })

    it('P0.2 — oculta los servicios no agendables (booking_mode ≠ appointment)', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      expect(screen.getByRole('option', { name: /Kinesiología/ })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Fisioterapia/ })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Aquagym/ })).not.toBeInTheDocument()
    })

    it('P0.1 — en modo "cualquiera" los horarios se etiquetan con el profesional y guardar fija ese profesional', async () => {
      vi.mocked(useAvailability).mockImplementation(({ enabled }) => {
        const shifts: AvailabilityShift[] = enabled
          ? [
              { ...makeShift('09:00'), professional_id: 'prof-1', professional_name: 'Patricia Pérez' },
              { ...makeShift('10:00'), professional_id: 'prof-2', professional_name: 'Aldo Luque' },
            ]
          : []
        return {
          daysShifts: {},
          daysSummary: {},
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
          shiftsForDate: () => shifts,
        }
      })
      setupFetch({
        search: [singlePatient],
        professionals: [
          { professional_id: 'prof-1', name: 'Patricia Pérez' },
          { professional_id: 'prof-2', name: 'Aldo Luque' },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('__any__')
      })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: '09:00 · Patricia Pérez' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '10:00 · Aldo Luque' })).toBeInTheDocument()
      })

      await user.selectOptions(screen.getByLabelText('Horario'), 'prof-2__10:00')
      await user.click(screen.getByRole('button', { name: /guardar turno/i }))

      await waitFor(() => {
        const call = mockFetch.mock.calls.find(
          (c) => c[0] === '/api/appointments' && (c[1] as { method?: string })?.method === 'POST',
        )
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.professional_id).toBe('prof-2')
        expect(body.appointment_time).toContain('T10:00:00')
      })
    })

    it('el input de fecha tiene atributo min (fix M-10)', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')

      await waitFor(() => {
        const dateInput = screen.getByLabelText('Fecha') as HTMLInputElement
        expect(dateInput.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })
    })
  })

  describe('horario por disponibilidad real (reclamo ISADI #5)', () => {
    const singlePatient = {
      patient_id: 'pat-uuid-1',
      full_name: 'María López',
      phone_number: '+5491111111111',
      obra_social: null,
      deletion_requested_at: null,
    }

    it('no muestra horarios inventados hasta elegir servicio + profesional + fecha', async () => {
      setupFetch({ search: [singlePatient] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      const timeSelect = screen.getByLabelText('Horario') as HTMLSelectElement
      expect(timeSelect.disabled).toBe(true)
      expect(screen.queryByRole('option', { name: '08:00' })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: '19:00' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Elegí servicio, profesional y fecha/i })).toBeInTheDocument()
    })

    it('al elegir servicio+profesional+fecha muestra solo los huecos libres reales', async () => {
      mockAvailability(['09:00', '15:00'])
      setupFetch({ search: [singlePatient], professionals: [{ professional_id: 'prof-1', name: 'Patricia Pérez' }] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: '09:00' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '15:00' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('option', { name: '08:00' })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: '10:00' })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: '19:00' })).not.toBeInTheDocument()
    })

    it('muestra "sin horarios libres" cuando la disponibilidad real está vacía', async () => {
      mockAvailability([])
      setupFetch({ search: [singlePatient], professionals: [{ professional_id: 'prof-1', name: 'Patricia Pérez' }] })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Sin horarios libres para esta fecha/i })).toBeInTheDocument()
      })
      expect((screen.getByLabelText('Horario') as HTMLSelectElement).disabled).toBe(true)
    })
  })

  describe('Story 10.7 — prefill desde hueco libre', () => {
    const singlePatient = {
      patient_id: 'pat-uuid-1',
      full_name: 'María López',
      phone_number: '+5491111111111',
      obra_social: null,
      deletion_requested_at: null,
    }

    it('al abrir con initialServiceId, carga los profesionales de ese servicio', async () => {
      setupFetch({ search: [], professionals: [{ professional_id: 'prof-1', name: 'Patricia Pérez' }] })

      render(
        <NewTurnoModal
          open={true}
          onClose={mockOnClose}
          date="2026-06-04"
          initialServiceId="svc-1"
          initialProfessionalId="prof-1"
          initialDate="2026-06-04"
          initialTimeHHmm="09:00"
        />,
      )

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-1/profesionales')
      })
    })

    it('con prefill: service/date/time vienen precargados', async () => {
      setupFetch({ search: [singlePatient], professionals: [{ professional_id: 'prof-1', name: 'Patricia Pérez' }] })

      render(
        <NewTurnoModal
          open={true}
          onClose={mockOnClose}
          date="2026-06-04"
          initialServiceId="svc-1"
          initialProfessionalId="prof-1"
          initialDate="2026-06-04"
          initialTimeHHmm="09:00"
        />,
      )

      // El profesional del hueco se fija una vez cargada la lista; recién ahí la
      // disponibilidad queda enabled y la <option> del horario prellenado existe.
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })
      expect((screen.getByLabelText('Servicio') as HTMLSelectElement).value).toBe('svc-1')
      expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-06-04')
      await waitFor(() => {
        expect((screen.getByLabelText('Horario') as HTMLSelectElement).value).toBe('09:00')
      })
    })

    it('sin prefill: el formulario arranca vacío (no regresión)', async () => {
      setupFetch({ search: [singlePatient] })

      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-06-04" />)

      await waitFor(() => screen.getByLabelText('Servicio'))
      expect((screen.getByLabelText('Servicio') as HTMLSelectElement).value).toBe('')
      expect((screen.getByLabelText('Horario') as HTMLSelectElement).value).toBe('')
    })
  })

  describe('botón Cancelar', () => {
    it('llama a onClose cuando se hace click en Cancelar', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })

  describe('modo serie de sesiones (bonos x5/x10)', () => {
    const singlePatient = {
      patient_id: 'pat-uuid-1',
      full_name: 'María López',
      phone_number: '+5491111111111',
      obra_social: null,
      deletion_requested_at: null,
    }

    // Disponibilidad con UN hueco único por fecha (start_at deriva de la fecha),
    // para poder acumular sesiones de días distintos sin colisión de start_at.
    function mockUniqueDailyAvailability() {
      vi.mocked(useAvailability).mockImplementation(({ enabled }) => ({
        daysShifts: {},
        daysSummary: {},
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        shiftsForDate: (d: string) =>
          enabled && d
            ? [
                {
                  ...makeShift('12:00'),
                  slot_start_iso: `${d}T15:00:00.000Z`,
                  slot_end_iso: `${d}T16:00:00.000Z`,
                },
              ]
            : [],
      }))
    }

    it('muestra el selector de cantidad de sesiones (1 / 5 / 10)', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)
      expect(screen.getByRole('button', { name: /1 turno/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /5 sesiones/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /10 sesiones/i })).toBeInTheDocument()
    })

    it('al elegir "10 sesiones" cambia a modo serie (botón Reservar, sin Fecha única)', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)

      await user.click(screen.getByRole('button', { name: /10 sesiones/i }))

      // Sin ninguna sesión elegida todavía, el botón dice "Reservar sesiones" y
      // está deshabilitado (reserva parcial: se habilita desde 1 elegida).
      const btn = screen.getByRole('button', { name: /reservar sesiones/i })
      expect(btn).toBeInTheDocument()
      expect(btn).toBeDisabled()
      expect(screen.getByText(/Serie de 10 sesiones/i)).toBeInTheDocument()
      // El campo "Fecha" del turno único ya no se muestra (lo maneja el scheduler).
      expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
    })

    it('en modo serie NO ofrece "Cualquier profesional disponible"', async () => {
      setupFetch({
        search: [singlePatient],
        professionals: [
          { professional_id: 'prof-1', name: 'Patricia Pérez' },
          { professional_id: 'prof-2', name: 'Aldo Luque' },
        ],
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)

      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))
      await user.click(screen.getByRole('button', { name: /5 sesiones/i }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Patricia Pérez' })).toBeInTheDocument()
      })
      expect(
        screen.queryByRole('option', { name: 'Cualquier profesional disponible' }),
      ).not.toBeInTheDocument()
    })

    it('reservar 5 sesiones: crea el bono y agenda las 5 en un solo flujo', async () => {
      mockUniqueDailyAvailability()
      mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url.includes('/api/patients/search')) return Promise.resolve(makeSearchResponse([singlePatient]))
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse([{ professional_id: 'prof-1', name: 'Patricia Pérez' }]))
        if (url === '/api/treatments' && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, treatment_id: 'trt-new' }) })
        }
        if (url.includes('/api/treatments/trt-new/sessions') && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, creadas: 5, skipped: [] }) })
        }
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)

      // Paciente + modo 5 sesiones + servicio (preselecciona el único profesional)
      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))
      await user.click(screen.getByRole('button', { name: /5 sesiones/i }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      // Elegir la fecha inicial y acumular 5 huecos (el calendario se auto-adelanta).
      fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-07' } })
      for (let i = 0; i < 5; i++) {
        const chip = await screen.findByRole('button', { name: '12:00' })
        await user.click(chip)
      }

      const reservar = screen.getByRole('button', { name: /reservar 5 sesiones/i })
      await waitFor(() => expect(reservar).toBeEnabled())
      await user.click(reservar)

      // 1) creó el bono con total_sessions = 5
      await waitFor(() => {
        const call = mockFetch.mock.calls.find(
          (c) => c[0] === '/api/treatments' && (c[1] as { method?: string })?.method === 'POST',
        )
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.total_sessions).toBe(5)
        expect(body.professional_id).toBe('prof-1')
        expect(body.service_id).toBe('svc-1')
      })

      // 2) agendó las 5 sesiones en el bono creado
      await waitFor(() => {
        const call = mockFetch.mock.calls.find(
          (c) =>
            typeof c[0] === 'string' &&
            c[0].includes('/api/treatments/trt-new/sessions') &&
            (c[1] as { method?: string })?.method === 'POST',
        )
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.slots).toHaveLength(5)
      })

      // 3) reserva completa: toast sin acción "Ir a completar"
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
          expect.stringContaining('las 5 sesiones'),
        )
      })
    })

    it('reserva parcial: agenda 3 de 5 y avisa las pendientes', async () => {
      mockUniqueDailyAvailability()
      mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url.includes('/api/patients/search')) return Promise.resolve(makeSearchResponse([singlePatient]))
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse([{ professional_id: 'prof-1', name: 'Patricia Pérez' }]))
        if (url === '/api/treatments' && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, treatment_id: 'trt-new' }) })
        }
        if (url.includes('/api/treatments/trt-new/sessions') && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, creadas: 3, skipped: [] }) })
        }
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)

      // Paciente + modo 5 sesiones + servicio (preselecciona el único profesional)
      await search(user, '87654321')
      await waitFor(() => screen.getByText(/María López/))
      await user.click(screen.getByRole('button', { name: /5 sesiones/i }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      // Elegir la fecha inicial y acumular solo 3 de las 5 sesiones del bono.
      fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-07' } })
      for (let i = 0; i < 3; i++) {
        const chip = await screen.findByRole('button', { name: '12:00' })
        await user.click(chip)
      }

      // (a) el botón refleja la reserva parcial y está habilitado.
      const reservar = screen.getByRole('button', { name: 'Reservar 3 (quedan 2)' })
      expect(reservar).toBeEnabled()
      await user.click(reservar)

      // (b) creó el bono con total_sessions = 5 (el cupo completo, no lo elegido).
      await waitFor(() => {
        const call = mockFetch.mock.calls.find(
          (c) => c[0] === '/api/treatments' && (c[1] as { method?: string })?.method === 'POST',
        )
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.total_sessions).toBe(5)
      })

      // (c) agendó solo las 3 sesiones elegidas en el bono creado.
      await waitFor(() => {
        const call = mockFetch.mock.calls.find(
          (c) =>
            typeof c[0] === 'string' &&
            c[0].includes('/api/treatments/trt-new/sessions') &&
            (c[1] as { method?: string })?.method === 'POST',
        )
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.slots).toHaveLength(3)
      })

      // (d) toast con el conteo real y una acción para completar el bono.
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
          expect.stringMatching(/3 de 5/),
          expect.objectContaining({ action: expect.anything() }),
        )
      })
      const [msg] = vi.mocked(toast.success).mock.calls[0]
      expect(msg).toContain('Faltan 2')
    })

    it('el botón está deshabilitado con 0 sesiones elegidas', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-07-07" />)

      await user.click(screen.getByRole('button', { name: /10 sesiones/i }))

      expect(screen.getByRole('button', { name: /reservar/i })).toBeDisabled()
    })
  })

  describe('patientSearchSchema', () => {
    it('acepta búsqueda con 2 o más caracteres', () => {
      expect(patientSearchSchema.safeParse({ query: 'ab' }).success).toBe(true)
      expect(patientSearchSchema.safeParse({ query: 'Juan García' }).success).toBe(true)
      expect(patientSearchSchema.safeParse({ query: '12345678' }).success).toBe(true)
    })

    it('rechaza búsqueda con menos de 2 caracteres', () => {
      expect(patientSearchSchema.safeParse({ query: '' }).success).toBe(false)
      expect(patientSearchSchema.safeParse({ query: 'a' }).success).toBe(false)
    })

    it('rechaza búsqueda de más de 100 caracteres', () => {
      expect(patientSearchSchema.safeParse({ query: 'a'.repeat(101) }).success).toBe(false)
    })
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { RescheduleTurnoModal } from './RescheduleTurnoModal'
import type { Appointment } from '@/types/appointments'

// Mock @base-ui/react/dialog
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Backdrop: () => null,
    Popup: ({ children }: { children: React.ReactNode }) => (
      <div role="dialog" aria-modal="true">{children}</div>
    ),
    Title: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
      <h2 id={id} className={className}>{children}</h2>
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

const NEW_PROFESSIONAL_ID = 'prof-2'

// Story 13.4 (corrección Medium): el selector se puebla desde
// /api/services/[serviceId]/profesionales (solo los del servicio del turno), NO
// desde useProfesionales (todos). Estos son los profesionales que atienden svc-1.
const SERVICE_PROFESSIONALS = [
  { professional_id: 'prof-1', name: 'Rocío González' },
  { professional_id: 'prof-2', name: 'Juan Pérez' },
]

const mockFetch = vi.fn()
global.fetch = mockFetch

// El modal hace 2 tipos de fetch: GET de profesionales del servicio y PATCH del turno.
// Diferenciamos por URL/método para que cada uno devuelva el shape correcto.
function defaultFetchImpl(url: string, init?: { method?: string }) {
  if (url.includes('/profesionales') && (init?.method ?? 'GET') === 'GET') {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ data: SERVICE_PROFESSIONALS }),
    })
  }
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) })
}

// Encuentra la llamada PATCH (el submit del turno) entre los fetch realizados.
function findPatchCall() {
  const call = mockFetch.mock.calls.find(
    (c) => (c[1] as { method?: string } | undefined)?.method === 'PATCH',
  )
  return call ? JSON.parse((call[1] as { body: string }).body) : null
}

const SAMPLE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: 'prof-1',
  appointment_time: '2026-05-07T10:00:00',
  start_at: '2026-05-07T10:00:00',
  end_at: '2026-05-07T11:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'María López' },
  services: { name: 'Fisioterapia', professional: 'Rocío González', duration_minutes: 60 },
  professionals: { name: 'Rocío González' },
}

const mockOnClose = vi.fn()

describe('RescheduleTurnoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(defaultFetchImpl)
  })

  describe('renderizado', () => {
    it('renderiza los campos de fecha y hora cuando open=true', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.getByLabelText('Nueva fecha')).toBeInTheDocument()
      expect(screen.getByLabelText('Nuevo horario')).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(
        <RescheduleTurnoModal
          open={false}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.queryByLabelText('Nueva fecha')).not.toBeInTheDocument()
    })

    it('muestra el nombre del paciente en el título', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      expect(screen.getByText(/María López/)).toBeInTheDocument()
    })

    it('tiene los botones Guardar y Cancelar con min-h-[44px]', () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      const saveBtn = screen.getByRole('button', { name: /guardar/i })
      const cancelBtn = screen.getByRole('button', { name: /cancelar/i })
      expect(saveBtn.className).toContain('min-h-[44px]')
      expect(cancelBtn.className).toContain('min-h-[44px]')
    })
  })

  describe('validación', () => {
    it('muestra error de validación cuando la fecha está vacía', async () => {
      const user = userEvent.setup()
      // Appointment sin start_at — defaultDate y defaultTime quedan vacíos
      const appointmentSinFecha: Appointment = {
        ...SAMPLE_APPOINTMENT,
        start_at: '', // forzar defaultTime y defaultDate vacíos
      }
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={appointmentSinFecha}
          date="2026-05-07"
        />
      )

      // Intentar guardar sin seleccionar horario (el select queda en "")
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      // Debería mostrar error de validación (horario inválido)
      const alert = await screen.findByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  describe('botón Cancelar', () => {
    it('llama a onClose cuando se hace click en Cancelar', async () => {
      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })

  describe('reset del form al cambiar appointment', () => {
    it('resetea el form cuando el appointment cambia (turno A → turno B)', async () => {
      const APPOINTMENT_B: Appointment = {
        ...SAMPLE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-08T14:00:00',
        end_at: '2026-05-08T15:00:00',
        patients: { full_name: 'Carlos Gómez' },
      }

      const { rerender } = render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      // Verificar que muestra la fecha del turno A
      const dateInput = screen.getByLabelText('Nueva fecha') as HTMLInputElement
      expect(dateInput.value).toBe('2026-05-07')

      // Cambiar al turno B
      rerender(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={APPOINTMENT_B}
          date="2026-05-08"
        />
      )

      // El form debe resetear al turno B
      await waitFor(() => {
        const dateInputB = screen.getByLabelText('Nueva fecha') as HTMLInputElement
        expect(dateInputB.value).toBe('2026-05-08')
      })
    })
  })

  describe('manejo de errores de API', () => {
    it('muestra error de slot conflict (409) como mensaje inline', async () => {
      // El GET de profesionales sigue OK; sólo el PATCH responde 409.
      mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url.includes('/profesionales') && (init?.method ?? 'GET') === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: SERVICE_PROFESSIONALS }) })
        }
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'slot_conflict' }) })
      })

      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      // Completar formulario: la fecha ya tiene valor por defecto, seleccionar hora
      const timeSelect = screen.getByLabelText('Nuevo horario')
      await user.selectOptions(timeSelect, '08:00')

      await user.click(screen.getByRole('button', { name: /guardar/i }))

      const errorMsg = await screen.findByText(/Ese horario ya no está disponible/i)
      expect(errorMsg).toBeInTheDocument()
    })
  })

  // ─── Story 13.4 — reasignación de profesional + invalidación del tracking ─────
  describe('Story 13.4 — reasignación de profesional', () => {
    it('renderiza el select de profesional pre-seleccionado con el profesional actual', async () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      const select = screen.getByLabelText('Profesional') as HTMLSelectElement
      expect(select).toBeInTheDocument()
      // Incluye la opción "Mantener profesional actual".
      expect(screen.getByRole('option', { name: /Mantener profesional actual/i })).toBeInTheDocument()
      // El select se puebla async desde /api/services/[serviceId]/profesionales →
      // tras la carga queda pre-seleccionado con el professional_id actual del turno.
      await waitFor(() => expect(select.value).toBe('prof-1'))
    })

    it('lista SOLO los profesionales que atienden el servicio del turno (corrección Medium)', async () => {
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )
      // Se consulta el endpoint filtrado por el service_id del turno (svc-1), NO el
      // listado completo del tenant.
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/services/svc-1/profesionales'),
        )
      )
      // El select muestra exactamente los profesionales del servicio.
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Rocío González' })).toBeInTheDocument()
      )
      expect(screen.getByRole('option', { name: 'Juan Pérez' })).toBeInTheDocument()
      // Opciones = "Mantener profesional actual" + 2 del servicio = 3.
      const select = screen.getByLabelText('Profesional') as HTMLSelectElement
      expect(select.options).toHaveLength(3)
    })

    it('submit cambiando el profesional → fetch con professional_id en el body', async () => {
      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      // Esperar a que el select se pueble antes de cambiarlo.
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Juan Pérez' })).toBeInTheDocument()
      )
      await user.selectOptions(screen.getByLabelText('Nuevo horario'), '08:00')
      await user.selectOptions(screen.getByLabelText('Profesional'), NEW_PROFESSIONAL_ID)
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      await waitFor(() => expect(findPatchCall()).not.toBeNull())
      const body = findPatchCall()
      expect(body.professional_id).toBe(NEW_PROFESSIONAL_ID)
      expect(body.start_at).toBeTruthy()
      expect(body.end_at).toBeTruthy()
    })

    it('submit sin cambiar el profesional → body SIN professional_id (sin regresión)', async () => {
      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      await user.selectOptions(screen.getByLabelText('Nuevo horario'), '08:00')
      // No se toca el select de profesional (queda en prof-1, el actual).
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      await waitFor(() => expect(findPatchCall()).not.toBeNull())
      const body = findPatchCall()
      expect(body).not.toHaveProperty('professional_id')
    })
  })

  describe('Story 13.4 — invalidación condicional del tracking de paquetes', () => {
    it('invalida ["treatments"] cuando el turno pertenece a una serie (package_id != null)', async () => {
      const user = userEvent.setup()
      const serieAppointment: Appointment = {
        ...SAMPLE_APPOINTMENT,
        package_id: 'treatment-1',
        session_index: 3,
      }
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={serieAppointment}
          date="2026-05-07"
        />
      )

      await user.selectOptions(screen.getByLabelText('Nuevo horario'), '08:00')
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      await waitFor(() =>
        expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['treatments'] })
      )
    })

    it('NO invalida ["treatments"] cuando el turno es suelto (package_id == null)', async () => {
      const user = userEvent.setup()
      render(
        <RescheduleTurnoModal
          open={true}
          onClose={mockOnClose}
          appointment={SAMPLE_APPOINTMENT}
          date="2026-05-07"
        />
      )

      await user.selectOptions(screen.getByLabelText('Nuevo horario'), '08:00')
      await user.click(screen.getByRole('button', { name: /guardar/i }))

      await waitFor(() => expect(mockInvalidateQueries).toHaveBeenCalled())
      const invalidatedKeys = mockInvalidateQueries.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown[] }).queryKey[0]
      )
      expect(invalidatedKeys).not.toContain('treatments')
    })
  })
})

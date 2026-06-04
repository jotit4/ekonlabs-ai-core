import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewTurnoModal } from './NewTurnoModal'
import { patientSearchSchema } from '@/lib/schemas/appointment.schema'

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
vi.mock('@refinedev/core', () => ({
  useList: () => ({
    result: {
      data: [
        {
          service_id: 'svc-1',
          name: 'Kinesiología',
          professional_name: 'Patricia Pérez',
          duration_minutes: 60,
        },
        {
          service_id: 'svc-2',
          name: 'Fisioterapia',
          professional_name: null,
          duration_minutes: 30,
        },
      ],
    },
  }),
}))

const mockOnClose = vi.fn()

// Helpers para respuestas fetch de búsqueda
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

describe('NewTurnoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: búsqueda sin resultados
    mockFetch.mockResolvedValue(makeSearchResponse([]))
  })

  describe('renderizado', () => {
    it('renderiza el campo de búsqueda y botón Buscar cuando open=true', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByPlaceholderText('DNI, nombre o teléfono...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /buscar/i })).toBeInTheDocument()
    })

    it('el input tiene placeholder "DNI, nombre o teléfono..."', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      const input = screen.getByPlaceholderText('DNI, nombre o teléfono...')
      expect(input).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(<NewTurnoModal open={false} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.queryByPlaceholderText('DNI, nombre o teléfono...')).not.toBeInTheDocument()
    })

    it('tiene el título "Nuevo turno"', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByText('Nuevo turno')).toBeInTheDocument()
    })

    it('tiene el botón Cancelar', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
  })

  describe('búsqueda de paciente', () => {
    it('llama al endpoint /api/patients/search con el parámetro q', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([
        {
          patient_id: 'pat-uuid-1',
          full_name: 'Juan García',
          phone_number: '+5491100000000',
          obra_social: 'OSDE',
          deletion_requested_at: null,
        },
      ]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), 'Juan')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/patients/search?q='),
        )
      })
    })

    it('auto-selecciona y muestra datos del paciente cuando hay exactamente 1 resultado', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([
        {
          patient_id: 'pat-uuid-1',
          full_name: 'Juan García',
          phone_number: '+5491100000000',
          obra_social: 'OSDE',
          deletion_requested_at: null,
        },
      ]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '12345678')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText('Juan García')).toBeInTheDocument()
      })
      expect(screen.getByText(/OSDE/)).toBeInTheDocument()
    })

    it('muestra lista de opciones cuando hay múltiples resultados', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([
        {
          patient_id: 'pat-1',
          full_name: 'Juan García',
          phone_number: '+5491100000000',
          obra_social: null,
          deletion_requested_at: null,
        },
        {
          patient_id: 'pat-2',
          full_name: 'Juan Pérez',
          phone_number: '+5491199999999',
          obra_social: 'OSDE',
          deletion_requested_at: null,
        },
      ]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), 'Juan')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByRole('list', { name: 'Resultados de búsqueda' })).toBeInTheDocument()
        expect(screen.getByText('Juan García')).toBeInTheDocument()
        expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
      })
    })

    it('selecciona paciente de la lista y muestra la tarjeta', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([
        {
          patient_id: 'pat-1',
          full_name: 'Juan García',
          phone_number: '+5491100000000',
          obra_social: null,
          deletion_requested_at: null,
        },
        {
          patient_id: 'pat-2',
          full_name: 'Juan Pérez',
          phone_number: '+5491199999999',
          obra_social: null,
          deletion_requested_at: null,
        },
      ]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), 'Juan')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByRole('list', { name: 'Resultados de búsqueda' })).toBeInTheDocument()
      })

      // Clic en el primer resultado
      await user.click(screen.getAllByRole('listitem')[0])

      await waitFor(() => {
        // La lista desaparece, aparece la tarjeta del paciente seleccionado
        expect(screen.queryByRole('list', { name: 'Resultados de búsqueda' })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Datos del turno')).toBeInTheDocument()
      })
    })

    it('muestra "Sin resultados" y formulario de creación inline cuando no hay coincidencia', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), 'NoExiste')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText(/Sin resultados para 'NoExiste'/)).toBeInTheDocument()
        expect(screen.getByText(/Nuevo paciente/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Nombre completo/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Teléfono/i)).toBeInTheDocument()
      })
    })

    it('muestra error de validación cuando la búsqueda es menor a 2 caracteres', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), 'a')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText(/Ingresá al menos 2 caracteres para buscar/)).toBeInTheDocument()
      })
    })

    it('muestra error si el paciente único tiene eliminación programada', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([
        {
          patient_id: 'pat-uuid-2',
          full_name: 'Carlos Gómez',
          phone_number: '+5491122334455',
          obra_social: null,
          deletion_requested_at: '2026-05-11T00:00:00Z',
        },
      ]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '11223344')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(
          screen.getByText('Este paciente tiene una eliminación programada')
        ).toBeInTheDocument()
      })

      // No debe mostrarse el formulario de turno
      expect(screen.queryByLabelText('Servicio')).not.toBeInTheDocument()
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

    it('muestra el selector de servicio y fecha tras encontrar paciente único', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([singlePatient]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByLabelText('Servicio')).toBeInTheDocument()
        expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
        expect(screen.getByLabelText('Horario')).toBeInTheDocument()
      })
    })

    it('muestra el botón "Guardar turno" tras encontrar paciente', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([singlePatient]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guardar turno/i })).toBeInTheDocument()
      })
    })

    it('envía appointment_time con offset -03:00 (fix C-05)', async () => {
      // Routear por URL para no depender del orden de los fetch
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/patients/search')) return Promise.resolve(makeSearchResponse([singlePatient]))
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse([{ professional_id: 'prof-1', name: 'Patricia Pérez' }]))
        if (url === '/api/appointments') return Promise.resolve(makeAppointmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      // Buscar paciente
      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))
      await waitFor(() => screen.getByLabelText('Servicio'))

      // Seleccionar servicio → dispara carga de profesionales
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      // Con un único profesional, se preselecciona automáticamente
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })

      await user.selectOptions(screen.getByLabelText('Horario'), '09:00')

      // Submit
      await user.click(screen.getByRole('button', { name: /guardar turno/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/appointments',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('-03:00'),
          })
        )
      })
    })

    it('carga el selector de profesionales filtrado por servicio y exige elegir uno', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/patients/search')) return Promise.resolve(makeSearchResponse([singlePatient]))
        if (url.includes('/profesionales'))
          return Promise.resolve(
            makeProfessionalsResponse([
              { professional_id: 'prof-1', name: 'Patricia Pérez' },
              { professional_id: 'prof-2', name: 'Aldo Luque' },
            ]),
          )
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))
      await waitFor(() => screen.getByLabelText('Servicio'))

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')

      // Llama al endpoint de profesionales del servicio elegido
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-1/profesionales')
      })

      // Con dos profesionales no se preselecciona — ambas opciones disponibles
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Patricia Pérez' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Aldo Luque' })).toBeInTheDocument()
      })
      expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('')
    })

    it('el input de fecha tiene atributo min (fix M-10)', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([singlePatient]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-15" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        const dateInput = screen.getByLabelText('Fecha') as HTMLInputElement
        expect(dateInput.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })
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
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) {
          return Promise.resolve(makeProfessionalsResponse([{ professional_id: 'prof-1', name: 'Patricia Pérez' }]))
        }
        return Promise.resolve(makeSearchResponse([]))
      })

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

    it('con prefill: tras seleccionar paciente, service/date/time vienen precargados', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/patients/search')) return Promise.resolve(makeSearchResponse([singlePatient]))
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse([{ professional_id: 'prof-1', name: 'Patricia Pérez' }]))
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
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

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => screen.getByLabelText('Servicio'))

      expect((screen.getByLabelText('Servicio') as HTMLSelectElement).value).toBe('svc-1')
      expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-06-04')
      expect((screen.getByLabelText('Horario') as HTMLSelectElement).value).toBe('09:00')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('prof-1')
      })
    })

    it('sin prefill: el formulario arranca vacío (no regresión)', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([singlePatient]))

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-06-04" />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

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

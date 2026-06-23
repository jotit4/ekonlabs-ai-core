import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewPaqueteModal } from './NewPaqueteModal'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const PROF_1 = 'f380ebe7-a4d6-4457-ae1b-9545876addb8'
const PROF_2 = '0bff67bd-87b2-41b9-bd93-1a37f3d335a2'

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
      ],
    },
  }),
}))

const mockOnClose = vi.fn()

const singlePatient = {
  patient_id: 'pat-uuid-1',
  full_name: 'María López',
  phone_number: '+5491111111111',
  obra_social: null,
  deletion_requested_at: null,
}

function makeSearchResponse(patients: object[]) {
  return { ok: true, status: 200, json: async () => ({ patients }) }
}

function makeProfessionalsResponse(
  professionals: { professional_id: string; name: string }[] = [
    { professional_id: PROF_1, name: 'Patricia Pérez' },
  ],
) {
  return { ok: true, status: 200, json: async () => ({ data: professionals }) }
}

function makeTreatmentResponse(ok = true, status = 201, error?: string) {
  return {
    ok,
    status,
    json: async () => (ok ? { success: true, treatment_id: 'trt-new' } : { error: error ?? 'Error' }),
  }
}

type GenSummary = {
  creados: number
  salteados: number
  no_colocados: number
  requested?: number
  placed?: number
  blocked_by_expiry?: boolean
}

function makeGenerateResponse(
  summary: GenSummary = { creados: 10, salteados: 0, no_colocados: 0 },
  ok = true,
  status = 200,
  error?: string,
) {
  const full = {
    requested: summary.creados + summary.no_colocados,
    placed: summary.creados,
    blocked_by_expiry: summary.no_colocados > 0,
    ...summary,
  }
  return {
    ok,
    status,
    json: async () =>
      ok ? { success: true, treatment_id: 'trt-new', ...full } : { error: error ?? 'Error' },
  }
}

// Despachador estándar para el flujo de 2 pasos en éxito completo.
function routeTwoStep(generateSummary?: GenSummary) {
  return (url: string) => {
    if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
    if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
    if (url.includes('/generate'))
      return Promise.resolve(makeGenerateResponse(generateSummary))
    return Promise.resolve(makeSearchResponse([]))
  }
}

// Rellena el form de paquete (con initialPatient) hasta dejarlo listo para enviar.
// El profesional es ÚNICO (un solo select "Profesional"); los días/horas no lo piden.
async function fillTreatmentForm(
  user: ReturnType<typeof userEvent.setup>,
  totalSessions = '10',
) {
  await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
  await waitFor(() => {
    expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(PROF_1)
  })
  const totalInput = screen.getByLabelText('Total de sesiones')
  await user.clear(totalInput)
  await user.type(totalInput, totalSessions)
  await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-10')
  await user.selectOptions(screen.getByLabelText('Horario'), '10:00')
}

describe('NewPaqueteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(makeSearchResponse([]))
  })

  describe('renderizado', () => {
    it('renderiza el título "Nuevo paquete" y el campo de búsqueda cuando open=true', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} />)
      expect(screen.getByText('Nuevo paquete')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('DNI, nombre o teléfono...')).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(<NewPaqueteModal open={false} onClose={mockOnClose} />)
      expect(screen.queryByText('Nuevo paquete')).not.toBeInTheDocument()
    })

    it('con initialPatient muestra el form de paquete directamente (sin buscar)', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      expect(screen.getByLabelText('Datos del paquete')).toBeInTheDocument()
      expect(screen.getByText('María López')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('DNI, nombre o teléfono...')).not.toBeInTheDocument()
    })

    it('tiene el botón Cancelar', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
  })

  describe('búsqueda de paciente', () => {
    it('tras encontrar 1 paciente, muestra el form de paquete', async () => {
      mockFetch.mockResolvedValueOnce(makeSearchResponse([singlePatient]))
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} />)

      await user.type(screen.getByPlaceholderText('DNI, nombre o teléfono...'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByLabelText('Servicio')).toBeInTheDocument()
        expect(screen.getByLabelText('Total de sesiones')).toBeInTheDocument()
      })
    })
  })

  describe('días y horas por semana', () => {
    it('arranca con 1 día y permite agregar y quitar', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      // 1 día inicial
      expect(screen.getByTestId('slot-row-0')).toBeInTheDocument()
      expect(screen.queryByTestId('slot-row-1')).not.toBeInTheDocument()

      // Agregar día
      await user.click(screen.getByRole('button', { name: /agregar día/i }))
      await waitFor(() => expect(screen.getByTestId('slot-row-1')).toBeInTheDocument())

      // Quitar el segundo día (aria-label "Quitar slot 2")
      await user.click(screen.getByRole('button', { name: /quitar slot 2/i }))
      await waitFor(() => expect(screen.queryByTestId('slot-row-1')).not.toBeInTheDocument())
    })

    it('con 1 solo día no muestra botón de quitar (mínimo 1)', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      expect(screen.getByTestId('slot-row-0')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
    })

    it('NO hay selector de profesional por día (un solo profesional para el paquete)', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      // Sólo existe UN select "Profesional" (el principal del paquete).
      expect(screen.getAllByLabelText('Profesional')).toHaveLength(1)
    })

    it('muestra un PREVIEW de la serie al completar día/hora/total/inicio', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      const totalInput = screen.getByLabelText('Total de sesiones')
      await user.clear(totalInput)
      await user.type(totalInput, '4')
      await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-08') // lunes
      await user.selectOptions(screen.getByLabelText('Día'), '1') // martes
      await user.selectOptions(screen.getByLabelText('Horario'), '10:00')

      await waitFor(() => {
        expect(screen.getByTestId('paquete-preview')).toBeInTheDocument()
      })
      expect(screen.getByText(/Se generan 4 sesiones: Martes 10:00/i)).toBeInTheDocument()
      // Fecha estimada de la última sesión (4 martes: 06-09,16,23,30)
      expect(screen.getByText(/Última sesión estimada:/i)).toBeInTheDocument()
    })

    it('el preview avisa que el fin de semana del patrón no se agendará', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-08')
      await user.selectOptions(screen.getByLabelText('Día'), '5') // sábado
      await user.selectOptions(screen.getByLabelText('Horario'), '10:00')

      await waitFor(() => {
        expect(
          screen.getByText(/Los días de fin de semana del patrón no se agendarán/i),
        ).toBeInTheDocument()
      })
    })

    it('los días usan la convención 0=Lunes..6=Domingo', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      const dayOptions = screen.getAllByRole('option', { name: 'Lunes' })
      expect(dayOptions[0]).toHaveValue('0')
      const domOptions = screen.getAllByRole('option', { name: 'Domingo' })
      expect(domOptions[0]).toHaveValue('6')
    })
  })

  describe('envío del formulario', () => {
    it('POST /api/treatments con el body esperado (pattern.slots) en éxito', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      // Servicio → dispara carga de profesionales (único → se preselecciona)
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(PROF_1)
      })

      // Total de sesiones
      const totalInput = screen.getByLabelText('Total de sesiones')
      await user.clear(totalInput)
      await user.type(totalInput, '10')

      // Fecha de inicio
      await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-10')

      // Día 1: sólo hora (el día arranca en Lunes=0 por default; sin profesional por día)
      await user.selectOptions(screen.getByLabelText('Horario'), '10:00')

      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/treatments',
          expect.objectContaining({ method: 'POST' }),
        )
      })

      const call = mockFetch.mock.calls.find((c) => c[0] === '/api/treatments')
      expect(call).toBeTruthy()
      const sentBody = JSON.parse(call![1].body)
      expect(sentBody.total_sessions).toBe(10)
      expect(sentBody.start_date).toBe('2026-06-10')
      // El profesional único viaja a nivel paquete, no por slot.
      expect(sentBody.professional_id).toBe(PROF_1)
      expect(sentBody.pattern.slots).toHaveLength(1)
      expect(sentBody.pattern.slots[0]).toEqual({ day_of_week: 0, time: '10:00' })
      // Los slots NO llevan professional_id
      expect(sentBody.pattern.slots[0].professional_id).toBeUndefined()
    })

    it('flujo de 2 pasos: tras 201 encadena /generate y muestra el resumen', async () => {
      mockFetch.mockImplementation(
        routeTwoStep({ creados: 9, salteados: 1, no_colocados: 0 }),
      )

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      // Paso 2: se disparó /generate sobre el treatment_id devuelto por el paso 1
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/treatments/trt-new/generate',
          expect.objectContaining({ method: 'POST' }),
        )
      })

      // Resumen legible de la generación
      await waitFor(() => {
        expect(
          screen.getByText(/Paquete creado\. 9 turnos creados, 1 salteado por conflicto\./i),
        ).toBeInTheDocument()
      })
    })

    it('resumen "10 turnos creados" cuando no hay salteados ni no_colocados', async () => {
      mockFetch.mockImplementation(routeTwoStep({ creados: 10, salteados: 0, no_colocados: 0 }))

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText(/Paquete creado\. 10 turnos creados\./i)).toBeInTheDocument()
      })
    })

    it('informa los no_colocados por vencimiento en el resumen', async () => {
      mockFetch.mockImplementation(routeTwoStep({ creados: 8, salteados: 0, no_colocados: 2 }))

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/Paquete creado\. 8 turnos creados, 2 no se pudieron agendar por vencimiento\./i),
        ).toBeInTheDocument()
      })
    })

    it('aviso accionable cuando blocked_by_expiry: ofrece extender vencimiento o reducir sesiones', async () => {
      mockFetch.mockImplementation(
        routeTwoStep({
          creados: 6,
          salteados: 0,
          no_colocados: 4,
          requested: 10,
          placed: 6,
          blocked_by_expiry: true,
        }),
      )

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText(/Se agendaron 6 de 10 sesiones/i)).toBeInTheDocument()
      })
      expect(
        screen.getByText(/extendé la fecha de vencimiento o reducí el total de sesiones/i),
      ).toBeInTheDocument()
    })

    it('si /generate falla: informa que el paquete se creó y permite reintentar (idempotente, sin re-crear)', async () => {
      // 1ª llamada a /generate falla (500); la 2ª (reintento) responde 200.
      let generateCalls = 0
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        if (url.includes('/generate')) {
          generateCalls += 1
          return generateCalls === 1
            ? Promise.resolve(makeGenerateResponse(undefined, false, 500, 'Error interno'))
            : Promise.resolve(makeGenerateResponse({ creados: 10, salteados: 0, no_colocados: 0 }))
        }
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      // Mensaje de error del paso 2 + botón de reintento
      const retryBtn = await screen.findByRole('button', { name: /generar turnos/i })
      expect(retryBtn).toBeInTheDocument()

      // El treatment NO se re-creó: /api/treatments se llamó UNA sola vez
      const createCalls = mockFetch.mock.calls.filter((c) => c[0] === '/api/treatments')
      expect(createCalls).toHaveLength(1)

      // Reintentar la generación → éxito
      await user.click(retryBtn)
      await waitFor(() => {
        expect(screen.getByText(/Paquete creado\. 10 turnos creados\./i)).toBeInTheDocument()
      })

      // /api/treatments sigue habiéndose llamado UNA sola vez (no re-creación)
      const createCallsAfter = mockFetch.mock.calls.filter((c) => c[0] === '/api/treatments')
      expect(createCallsAfter).toHaveLength(1)
    })

    it('muestra error del server (400) sin cerrar', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments')
          return Promise.resolve(
            makeTreatmentResponse(false, 400, 'El profesional X no atiende ese servicio'),
          )
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(PROF_1)
      })
      const totalInput = screen.getByLabelText('Total de sesiones')
      await user.clear(totalInput)
      await user.type(totalInput, '5')
      await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-10')
      await user.selectOptions(screen.getByLabelText('Horario'), '10:00')

      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText('El profesional X no atiende ese servicio')).toBeInTheDocument()
      })
    })

    it('carga los profesionales filtrados por servicio al elegir servicio', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales'))
          return Promise.resolve(
            makeProfessionalsResponse([
              { professional_id: PROF_1, name: 'Patricia Pérez' },
              { professional_id: PROF_2, name: 'Aldo Luque' },
            ]),
          )
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-1/profesionales')
      })
      await waitFor(() => {
        expect(screen.getAllByRole('option', { name: 'Patricia Pérez' }).length).toBeGreaterThan(0)
        expect(screen.getAllByRole('option', { name: 'Aldo Luque' }).length).toBeGreaterThan(0)
      })
    })
  })

  describe('botón Cancelar', () => {
    it('llama a onClose al hacer click en Cancelar', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} />)
      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })
})

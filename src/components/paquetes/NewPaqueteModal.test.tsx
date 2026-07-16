import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewPaqueteModal } from './NewPaqueteModal'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const PROF_1 = 'f380ebe7-a4d6-4457-ae1b-9545876addb8'
const PROF_2 = '0bff67bd-87b2-41b9-bd93-1a37f3d335a2'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
import { toast } from 'sonner'

// MultiSessionScheduler (Pedido B — propuesta automática de 5/10 sesiones) se
// testea en su propio archivo; acá se mockea con un control simple que emite
// slots deterministas, para aislar el flujo de creación del bono + confirmación.
vi.mock('@/components/agenda/MultiSessionScheduler', () => ({
  MultiSessionScheduler: ({
    total,
    onChange,
  }: {
    total: number
    onChange: (slots: { start_at: string; end_at: string; date: string; label: string; professional_id?: string }[]) => void
  }) => (
    <div data-testid="multi-session-scheduler">
      <span>Elegí {total} horarios</span>
      <button
        type="button"
        onClick={() =>
          onChange([
            { start_at: '2026-07-08T13:00:00.000Z', end_at: '2026-07-08T14:00:00.000Z', date: '2026-07-08', label: '10:00', professional_id: PROF_1 },
          ])
        }
      >
        elegir-propuesta
      </button>
    </div>
  ),
}))

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

// Rellena el form del bono (con initialPatient) hasta dejarlo listo para enviar.
// Ya NO pide patrón semanal ni fecha de inicio: solo servicio, profesional, total.
// El default del profesional ahora es "cualquiera" (Pedido A #2) — acá se elige
// el concreto PROF_1 para no mezclar ese flujo con el de esta suite (que se
// prueba aparte).
async function fillTreatmentForm(
  user: ReturnType<typeof userEvent.setup>,
  totalSessions = '10',
) {
  await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
  await waitFor(() => {
    expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('__any__')
  })
  await user.selectOptions(screen.getByLabelText('Profesional'), PROF_1)
  const totalInput = screen.getByLabelText('Total de sesiones')
  await user.clear(totalInput)
  await user.type(totalInput, totalSessions)
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

    it('con initialPatient muestra el form del bono directamente (sin buscar)', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      expect(screen.getByLabelText('Datos del paquete')).toBeInTheDocument()
      expect(screen.getByText('María López')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('DNI, nombre o teléfono...')).not.toBeInTheDocument()
    })

    it('NO muestra patrón semanal ni fecha de inicio (se eliminó la generación automática)', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      expect(screen.queryByText(/días y horas por semana/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Día')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Horario')).not.toBeInTheDocument()
      // Solo existe UN select "Profesional" (el principal del bono).
      expect(screen.getAllByLabelText('Profesional')).toHaveLength(1)
    })

    it('tiene el botón Cancelar', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
  })

  describe('búsqueda de paciente', () => {
    it('tras encontrar 1 paciente, muestra el form del bono', async () => {
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

  describe('envío del formulario', () => {
    it('POST /api/treatments con el body del bono (sin pattern ni start_date)', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user, '10')
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
      expect(sentBody.professional_id).toBe(PROF_1)
      // El bono ya NO lleva patrón ni fecha de inicio.
      expect(sentBody.pattern).toBeUndefined()
      expect(sentBody.start_date).toBeUndefined()
    })

    it('NO llama a /generate (se eliminó la generación automática)', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText(/Paquete creado/i)).toBeInTheDocument()
      })
      const generateCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes('/generate'))
      expect(generateCalls).toHaveLength(0)
    })

    it('en éxito muestra el mensaje guía para agendar sesiones después', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })

      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user)
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText(/Paquete creado/i)).toBeInTheDocument()
      })
      // El form ya no se muestra tras crear; aparece el botón "Cerrar".
      expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument()
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

      await fillTreatmentForm(user, '5')
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

  describe('Pedido B (ISADI 2026-07-14) — botones rápidos 5/10 sesiones', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        return Promise.resolve(makeSearchResponse([]))
      })
    })

    it('ofrece botones rápidos 5 y 10 además de la cantidad libre', () => {
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)
      expect(screen.getByRole('button', { name: '5 sesiones' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '10 sesiones' })).toBeInTheDocument()
      expect(screen.getByLabelText('Total de sesiones')).toBeInTheDocument()
    })

    it('clickear "5 sesiones" fija el total en el input y lo marca activo', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.click(screen.getByRole('button', { name: '5 sesiones' }))

      expect((screen.getByLabelText('Total de sesiones') as HTMLInputElement).value).toBe('5')
      expect(screen.getByRole('button', { name: '5 sesiones' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: '10 sesiones' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('la cantidad libre sigue editable (no reemplazada por los botones)', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      const input = screen.getByLabelText('Total de sesiones')
      await user.clear(input)
      await user.type(input, '3')
      expect((input as HTMLInputElement).value).toBe('3')
    })
  })

  describe('Pedido A #2 (ISADI 2026-07-14) — bono sin profesional fijo ("cualquier profesional")', () => {
    it('ofrece "Cualquier profesional disponible" como default y NO manda professional_id al crear', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments') return Promise.resolve(makeTreatmentResponse())
        return Promise.resolve(makeSearchResponse([]))
      })
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await waitFor(() => {
        expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe('__any__')
      })
      expect(screen.getByRole('option', { name: 'Cualquier profesional disponible' })).toBeInTheDocument()

      const totalInput = screen.getByLabelText('Total de sesiones')
      await user.clear(totalInput)
      await user.type(totalInput, '3')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        const call = mockFetch.mock.calls.find((c) => c[0] === '/api/treatments')
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body).not.toHaveProperty('professional_id')
        expect(body.total_sessions).toBe(3)
      })
    })
  })

  describe('Pedido B — propuesta y confirmación de fechas para bonos de 5/10', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments' && init?.method === 'POST') return Promise.resolve(makeTreatmentResponse())
        if (url === '/api/treatments/trt-new/sessions' && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, creadas: 1, skipped: [] }) })
        }
        return Promise.resolve(makeSearchResponse([]))
      })
    })

    it('tras crear un bono de 5, muestra la propuesta de horarios (MultiSessionScheduler) ANTES de agendar nada', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.click(screen.getByRole('button', { name: '5 sesiones' }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByTestId('multi-session-scheduler')).toBeInTheDocument()
      })
      // Nada se agendó todavía (solo se creó el bono).
      const sessionsCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes('/sessions'))
      expect(sessionsCalls).toHaveLength(0)
      expect(screen.getByRole('button', { name: /confirmar y agendar/i })).toBeDisabled()
    })

    it('NO ofrece la propuesta para cantidades distintas de 5/10 (ej. 3)', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      const totalInput = screen.getByLabelText('Total de sesiones')
      await user.clear(totalInput)
      await user.type(totalInput, '3')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByText(/Paquete creado/i)).toBeInTheDocument()
      })
      expect(screen.queryByTestId('multi-session-scheduler')).not.toBeInTheDocument()
    })

    it('confirmar la propuesta hace POST a /sessions con los slots elegidos', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.click(screen.getByRole('button', { name: '10 sesiones' }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => screen.getByTestId('multi-session-scheduler'))
      await user.click(screen.getByRole('button', { name: 'elegir-propuesta' }))

      const confirmar = screen.getByRole('button', { name: /confirmar y agendar 1/i })
      await waitFor(() => expect(confirmar).toBeEnabled())
      await user.click(confirmar)

      await waitFor(() => {
        const call = mockFetch.mock.calls.find((c) => c[0] === '/api/treatments/trt-new/sessions')
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.slots).toHaveLength(1)
        expect(body.slots[0].start_at).toBe('2026-07-08T13:00:00.000Z')
        // Default "cualquier profesional" (no se eligió uno concreto) → cada
        // slot viaja con su propio professional_id (Pedido A #2/#3).
        expect(body.slots[0].professional_id).toBe(PROF_1)
      })
      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalled()
      })
    })

    it('Pedido 6 (ISADI 2026-07-14/16) — el scheduler embebido (5/10) ofrece color y lo manda al confirmar', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await user.click(screen.getByRole('button', { name: '10 sesiones' }))
      await user.selectOptions(screen.getByLabelText('Servicio'), 'svc-1')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => screen.getByTestId('multi-session-scheduler'))
      expect(screen.getByText('Color para todas las sesiones de este paquete')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'elegir-propuesta' }))
      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      const confirmar = screen.getByRole('button', { name: /confirmar y agendar 1/i })
      await waitFor(() => expect(confirmar).toBeEnabled())
      await user.click(confirmar)

      await waitFor(() => {
        const call = mockFetch.mock.calls.find((c) => c[0] === '/api/treatments/trt-new/sessions')
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.color).toBe('#00FFFF')
      })
    })
  })

  describe('Pedido 7 (ISADI 2026-07-16) — botón "Agendar sesión" para cantidades ≠ 5/10', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url.includes('/profesionales')) return Promise.resolve(makeProfessionalsResponse())
        if (url === '/api/treatments' && init?.method === 'POST') return Promise.resolve(makeTreatmentResponse())
        if (url === '/api/treatments/trt-new/sessions' && init?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, creadas: 1, skipped: [] }) })
        }
        return Promise.resolve(makeSearchResponse([]))
      })
    })

    it('para 3 sesiones, ofrece "Agendar sesión" en el aviso (NO el scheduler embebido)', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user, '3')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Agendar sesión' })).toBeInTheDocument()
      })
      expect(screen.queryByTestId('multi-session-scheduler')).not.toBeInTheDocument()
    })

    it('clic en "Agendar sesión" abre el modal de agendado con los datos del bono recién creado, sin cerrar el modal padre', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user, '3')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))
      await waitFor(() => screen.getByRole('button', { name: 'Agendar sesión' }))

      await user.click(screen.getByRole('button', { name: 'Agendar sesión' }))

      // Bono nuevo → porAgendar = total (3); profesional PROF_1 elegido en el form.
      await waitFor(() => {
        expect(screen.getByText(/faltan agendar 3/i)).toBeInTheDocument()
      })
      // El modal padre NO se cerró. El botón trigger de la aviso desaparece
      // mientras el sub-modal está abierto (evita el duplicado con el propio
      // botón de confirmar de AgendarSesionModal, que arranca deshabilitado
      // sin slots elegidos — por eso queda uno solo, y deshabilitado).
      expect(mockOnClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Agendar sesión' })).toBeDisabled()
    })

    it('agendar desde ese botón hace POST a /sessions del bono recién creado', async () => {
      const user = userEvent.setup()
      render(<NewPaqueteModal open={true} onClose={mockOnClose} initialPatient={singlePatient} />)

      await fillTreatmentForm(user, '3')
      await user.click(screen.getByRole('button', { name: /crear paquete/i }))
      await waitFor(() => screen.getByRole('button', { name: 'Agendar sesión' }))
      await user.click(screen.getByRole('button', { name: 'Agendar sesión' }))

      await waitFor(() => screen.getByTestId('multi-session-scheduler'))
      await user.click(screen.getByRole('button', { name: 'elegir-propuesta' }))
      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))

      const confirmBtn = await screen.findByRole('button', { name: 'Agendar sesión' })
      await waitFor(() => expect(confirmBtn).toBeEnabled())
      await user.click(confirmBtn)

      await waitFor(() => {
        const call = mockFetch.mock.calls.find((c) => c[0] === '/api/treatments/trt-new/sessions')
        expect(call).toBeTruthy()
        const body = JSON.parse((call![1] as { body: string }).body)
        expect(body.slots).toHaveLength(1)
        expect(body.color).toBe('#00FFFF')
      })
    })
  })
})

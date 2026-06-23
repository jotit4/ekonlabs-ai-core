import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mock de createSupabaseBrowserClient con query builder encadenable ──
// El componente usa: supabase.from('treatments').select(...).eq(...).order(...)
// `.order()` resuelve la promesa final ({ data, error }).
const { mockOrder } = vi.hoisted(() => ({ mockOrder: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: mockOrder,
        }),
      }),
    }),
  }),
}))

// TreatmentPlanPanel (Story 14.2) se testea en su propio archivo; acá se mockea
// para no arrastrar useCurrentTenant/auth al test de tracking (13.5).
vi.mock('./TreatmentPlanPanel', () => ({
  TreatmentPlanPanel: () => null,
}))

// SessionNotePanel (Story 14.3) — mismo recurso: se testea en su propio archivo.
vi.mock('./SessionNotePanel', () => ({
  SessionNotePanel: () => null,
}))

// AgendarSesionModal (reclamo ISADI) — se testea en su propio archivo; acá se
// mockea para asilar el tracking. Renderiza un sentinel solo cuando open=true.
vi.mock('./AgendarSesionModal', () => ({
  AgendarSesionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="agendar-sesion-modal" /> : null,
}))

import { PaquetesTracking } from './PaquetesTracking'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const PATIENT_ID = 'patient-uuid-1'

function makeTreatment() {
  return {
    treatment_id: 'trt-1',
    tenant_id: 'tenant-1',
    patient_id: PATIENT_ID,
    service_id: 'svc-1',
    professional_id: 'prof-1',
    total_sessions: 10,
    sessions_remaining: 10, // ya no alimenta el contador (se deriva de las sesiones reales)
    start_date: '2026-06-10',
    pattern: { slots: [] },
    status: 'active',
    expires_at: '2026-09-10',
    created_at: '2026-06-09T00:00:00Z',
    services: { name: 'Kinesiología' },
    professionals: { name: 'Patricia Pérez' },
    appointments: [
      {
        appointment_id: 'apt-2',
        session_index: 2,
        start_at: '2026-06-17T10:00:00Z',
        end_at: '2026-06-17T11:00:00Z',
        status: 'confirmed',
      },
      {
        appointment_id: 'apt-1',
        session_index: 1,
        start_at: '2026-06-10T10:00:00Z',
        end_at: '2026-06-10T11:00:00Z',
        status: 'completed',
      },
    ],
  }
}

describe('PaquetesTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza el contador, servicio, profesional, estado, vencimiento y las sesiones ordenadas', async () => {
    mockOrder.mockResolvedValue({ data: [makeTreatment()], error: null })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    // Contador HONESTO desde las sesiones reales: 1 completed + 1 confirmed.
    // realizadas=1, agendadas=2, total=10 → faltan agendar 8.
    await waitFor(() => {
      expect(screen.getByText('1 de 10 sesiones realizadas')).toBeInTheDocument()
    })
    expect(screen.getByText(/2 agendadas · faltan agendar 8/)).toBeInTheDocument()
    expect(screen.getByText('Kinesiología')).toBeInTheDocument()
    expect(screen.getByText('Patricia Pérez')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    // Vencimiento formateado en español
    expect(screen.getByText(/septiembre/i)).toBeInTheDocument()

    // Sesiones por session_index, ordenadas: la sesión 1 aparece antes que la 2
    const sesion1 = screen.getByText('Sesión 1')
    const sesion2 = screen.getByText('Sesión 2')
    expect(sesion1).toBeInTheDocument()
    expect(sesion2).toBeInTheDocument()
    expect(
      sesion1.compareDocumentPosition(sesion2) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // Labels de estado de las sesiones (STATUS_LABELS)
    expect(screen.getByText('Completado')).toBeInTheDocument()
    expect(screen.getByText('Confirmado')).toBeInTheDocument()
  })

  it('regresión: 2 turnos sin realizar y total=10 NO muestra "8 realizadas" (bug del contador)', async () => {
    const t = makeTreatment()
    t.total_sessions = 10
    t.sessions_remaining = 2 // valor sobrecargado del bug viejo — el contador NO debe usarlo
    t.appointments = [
      {
        appointment_id: 'a1',
        session_index: 1,
        start_at: '2026-06-10T10:00:00Z',
        end_at: '2026-06-10T11:00:00Z',
        status: 'confirmed',
      },
      {
        appointment_id: 'a2',
        session_index: 2,
        start_at: '2026-06-17T10:00:00Z',
        end_at: '2026-06-17T11:00:00Z',
        status: 'confirmed',
      },
    ]
    mockOrder.mockResolvedValue({ data: [t], error: null })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText('0 de 10 sesiones realizadas')).toBeInTheDocument()
    })
    expect(screen.getByText(/2 agendadas · faltan agendar 8/)).toBeInTheDocument()
    // NO debe aparecer el texto falso del bug viejo
    expect(screen.queryByText(/8 de 10/)).not.toBeInTheDocument()
    expect(screen.queryByText(/consumidas/)).not.toBeInTheDocument()
  })

  it('estado vacío: "Este paciente no tiene paquetes."', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Este paciente no tiene paquetes.')).toBeInTheDocument()
    })
  })

  it('estado de error: muestra un alert', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'boom' } })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/error al cargar los paquetes/i)).toBeInTheDocument()
  })

  it('muestra "Agendar sesión" cuando faltan sesiones por agendar y abre el modal', async () => {
    // makeTreatment: total=10, agendadas=2 → por_agendar=8, status active → botón visible.
    mockOrder.mockResolvedValue({ data: [makeTreatment()], error: null })
    const user = userEvent.setup()

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    const btn = await screen.findByRole('button', { name: /agendar sesión/i })
    expect(btn).toBeInTheDocument()

    await user.click(btn)
    await waitFor(() => {
      expect(screen.getByTestId('agendar-sesion-modal')).toBeInTheDocument()
    })
  })

  it('NO muestra "Agendar sesión" cuando todas las sesiones están agendadas', async () => {
    const t = makeTreatment()
    t.total_sessions = 2
    // 2 turnos agendados (confirmed) = total → por_agendar = 0.
    t.appointments = [
      { appointment_id: 'a1', session_index: 1, start_at: '2026-06-10T10:00:00Z', end_at: '2026-06-10T11:00:00Z', status: 'confirmed' },
      { appointment_id: 'a2', session_index: 2, start_at: '2026-06-17T10:00:00Z', end_at: '2026-06-17T11:00:00Z', status: 'confirmed' },
    ]
    mockOrder.mockResolvedValue({ data: [t], error: null })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/2 agendadas · todas agendadas/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /agendar sesión/i })).not.toBeInTheDocument()
  })

  it('paquete sin vencimiento muestra "Sin vencimiento"', async () => {
    const t = makeTreatment()
    t.expires_at = null as unknown as string
    mockOrder.mockResolvedValue({ data: [t], error: null })

    render(<PaquetesTracking patientId={PATIENT_ID} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Sin vencimiento')).toBeInTheDocument()
    })
  })
})

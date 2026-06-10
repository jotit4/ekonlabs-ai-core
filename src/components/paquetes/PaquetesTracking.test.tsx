import { render, screen, waitFor } from '@testing-library/react'
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
    sessions_remaining: 7, // → 3 consumidas, 7 restantes
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

    await waitFor(() => {
      expect(screen.getByText('3/10 consumidas, 7 restantes')).toBeInTheDocument()
    })
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

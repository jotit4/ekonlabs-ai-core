import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockUseCurrentTenant } = vi.hoisted(() => ({
  mockUseCurrentTenant: vi.fn(),
}))

vi.mock('@/hooks/use-current-tenant', () => ({
  useCurrentTenant: mockUseCurrentTenant,
}))

import { TreatmentPlanPanel } from './TreatmentPlanPanel'

const TREATMENT_ID = 'trt-1'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: 'plan-1',
    tenant_id: 'tenant-1',
    treatment_id: TREATMENT_ID,
    patient_id: 'patient-1',
    motivo_consulta: 'Lumbalgia crónica',
    objetivo: 'Reducir dolor',
    cie10_code: 'M54.5',
    indicated_sessions: 10,
    discharge_at: null,
    discharge_report: null,
    author_id: 'user-1',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'doctor', loading: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockGetPlan(plan: unknown) {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ plan }) })
}

async function expandPanel(sessionsRemaining = 0) {
  render(<TreatmentPlanPanel treatmentId={TREATMENT_ID} sessionsRemaining={sessionsRemaining} />, {
    wrapper: makeWrapper(),
  })
  await userEvent.click(screen.getByRole('button', { name: /plan de tratamiento/i }))
}

describe('TreatmentPlanPanel — gating por rol (HCE, Ley 25.326)', () => {
  it('NO renderiza nada para receptionist (ni botón ni sección)', () => {
    mockUseCurrentTenant.mockReturnValue({
      tenantId: 'tenant-1',
      role: 'receptionist',
      loading: false,
    })
    const { container } = render(<TreatmentPlanPanel treatmentId={TREATMENT_ID} sessionsRemaining={0} />, {
      wrapper: makeWrapper(),
    })
    expect(container).toBeEmptyDOMElement()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('NO renderiza nada mientras el rol carga', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: null, role: null, loading: true })
    const { container } = render(<TreatmentPlanPanel treatmentId={TREATMENT_ID} sessionsRemaining={0} />, {
      wrapper: makeWrapper(),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renderiza el toggle colapsado para doctor, sin fetch hasta expandir', () => {
    render(<TreatmentPlanPanel treatmentId={TREATMENT_ID} sessionsRemaining={0} />, { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /plan de tratamiento/i })).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('renderiza el toggle para admin', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'admin', loading: false })
    render(<TreatmentPlanPanel treatmentId={TREATMENT_ID} sessionsRemaining={0} />, { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /plan de tratamiento/i })).toBeInTheDocument()
  })
})

describe('TreatmentPlanPanel — carga y formulario', () => {
  it('al expandir hace GET y muestra el form con los valores del plan', async () => {
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toHaveValue('Lumbalgia crónica')
    })
    expect(mockFetch).toHaveBeenCalledWith(`/api/treatments/${TREATMENT_ID}/plan`)
    expect(screen.getByLabelText(/objetivo/i)).toHaveValue('Reducir dolor')
    expect(screen.getByLabelText(/cie-10/i)).toHaveValue('M54.5')
    expect(screen.getByLabelText(/sesiones indicadas/i)).toHaveValue(10)
  })

  it('plan null (aún no creado) → formulario vacío listo para crear', async () => {
    mockGetPlan(null)
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toHaveValue('')
    })
    expect(screen.getByLabelText(/objetivo/i)).toHaveValue('')
    expect(screen.getByLabelText(/cie-10/i)).toHaveValue('')
    expect(screen.getByLabelText(/sesiones indicadas/i)).toHaveValue(null)
  })

  it('error del GET (p.ej. tabla sin migrar en prod) → mensaje sin crash', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'boom' }) })
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/no se pudo cargar el plan/i)).toBeInTheDocument()
  })
})

describe('TreatmentPlanPanel — guardado', () => {
  it('submit llama PUT con el body correcto e invalida la query (muestra "Plan guardado")', async () => {
    const user = userEvent.setup()
    mockGetPlan(null)
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/motivo de consulta/i), 'Cervicalgia')
    await user.type(screen.getByLabelText(/objetivo/i), 'Recuperar movilidad')
    await user.type(screen.getByLabelText(/cie-10/i), 'm54.2')
    await user.type(screen.getByLabelText(/sesiones indicadas/i), '8')

    mockFetch.mockClear()
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plan: makePlan() }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: makePlan() }) })
    })

    await user.click(screen.getByRole('button', { name: /guardar plan/i }))

    await waitFor(() => {
      expect(screen.getByText(/plan guardado/i)).toBeInTheDocument()
    })

    const putCall = mockFetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(putCall![0]).toBe(`/api/treatments/${TREATMENT_ID}/plan`)
    const body = JSON.parse(putCall![1].body as string)
    expect(body).toMatchObject({
      motivo_consulta: 'Cervicalgia',
      objetivo: 'Recuperar movilidad',
      indicated_sessions: 8,
    })
    // El resolver normaliza el CIE-10 a MAYÚSCULAS antes del PUT
    expect(body.cie10_code).toBe('M54.2')
    // Nunca viajan discharge_* ni tenant/patient/author en el body
    expect(body).not.toHaveProperty('discharge_at')
    expect(body).not.toHaveProperty('discharge_report')
    expect(body).not.toHaveProperty('tenant_id')
    expect(body).not.toHaveProperty('patient_id')
    expect(body).not.toHaveProperty('author_id')
  })

  it('CIE-10 inválido → error de validación en el form, sin PUT', async () => {
    const user = userEvent.setup()
    mockGetPlan(null)
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/cie-10/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/cie-10/i), 'XX99')
    mockFetch.mockClear()
    await user.click(screen.getByRole('button', { name: /guardar plan/i }))

    await waitFor(() => {
      expect(screen.getByText(/cie-10 inválido/i)).toBeInTheDocument()
    })
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('error del PUT → mensaje de error visible', async () => {
    const user = userEvent.setup()
    mockGetPlan(null)
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toBeInTheDocument()
    })

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'fail' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: null }) })
    })

    await user.click(screen.getByRole('button', { name: /guardar plan/i }))

    await waitFor(() => {
      expect(screen.getByText(/no se pudo guardar el plan/i)).toBeInTheDocument()
    })
  })
})

// ─── Story 14.6 — alta / informe final ─────────────────────────────────────────

function makeDischargedPlan(overrides: Record<string, unknown> = {}) {
  return makePlan({
    discharge_at: '2026-06-11T14:30:00Z',
    discharge_report: 'Paciente recuperado. Evolución favorable, sin dolor residual.',
    ...overrides,
  })
}

describe('TreatmentPlanPanel — read-only post-alta (Story 14.6)', () => {
  it('plan con discharge_at → SOLO LECTURA: campos como texto, sin form ni botón Guardar', async () => {
    mockGetPlan(makeDischargedPlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByText('Lumbalgia crónica')).toBeInTheDocument()
    })
    // Campos del plan como texto, no como inputs
    expect(screen.getByText('Reducir dolor')).toBeInTheDocument()
    expect(screen.getByText('M54.5')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.queryByLabelText(/motivo de consulta/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar plan/i })).not.toBeInTheDocument()
    // Sin sección de alta (ya está dado de alta)
    expect(screen.queryByRole('button', { name: /dar el alta/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('muestra el informe final y la fecha del alta formateada es-AR', async () => {
    mockGetPlan(makeDischargedPlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByText(/informe final/i)).toBeInTheDocument()
    })
    expect(
      screen.getByText(/paciente recuperado\. evolución favorable/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/alta: 11 de junio de 2026/i)).toBeInTheDocument()
  })

  it('discharge_at inválido → "—" sin crash', async () => {
    mockGetPlan(makeDischargedPlan({ discharge_at: 'no-es-fecha' }))
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByText(/alta: —/i)).toBeInTheDocument()
    })
  })
})

describe('TreatmentPlanPanel — sección de alta (Story 14.6)', () => {
  it('plan SIN alta → form de edición + sección "Alta / informe final" con textarea y botón', async () => {
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toHaveValue('Lumbalgia crónica')
    })
    expect(screen.getByText(/alta \/ informe final/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dar el alta/i })).toBeInTheDocument()
  })

  it('plan null → SIN sección de alta (el server respondería 409)', async () => {
    mockGetPlan(null)
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/motivo de consulta/i)).toHaveValue('')
    })
    expect(screen.queryByText(/alta \/ informe final/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dar el alta/i })).not.toBeInTheDocument()
  })

  it('botón "Dar el alta…" deshabilitado con informe vacío; se habilita al escribir', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dar el alta/i })).toBeDisabled()
    })

    await user.type(
      screen.getByLabelText(/informe final del tratamiento/i),
      'Informe de cierre',
    )
    expect(screen.getByRole('button', { name: /dar el alta/i })).toBeEnabled()
  })

  it('confirmación inline en dos pasos: "Dar el alta…" abre el alertdialog, "Cancelar" lo cierra sin POST', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/informe final del tratamiento/i), 'Informe')
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    const dialog = screen.getByRole('alertdialog', { name: /confirmar alta/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument()

    mockFetch.mockClear()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('sessionsRemaining > 0 → la confirmación advierte las sesiones restantes pero permite confirmar', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel(4)

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/informe final del tratamiento/i), 'Informe')
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    expect(screen.getByText(/quedan 4 sesiones restantes en el paquete/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar alta/i })).toBeEnabled()
  })

  it('sessionsRemaining = 0 → la confirmación NO muestra la advertencia', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel(0)

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/informe final del tratamiento/i), 'Informe')
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByText(/sesiones restantes/i)).not.toBeInTheDocument()
  })
})

describe('TreatmentPlanPanel — POST discharge (Story 14.6)', () => {
  it('"Confirmar alta" hace POST con body { discharge_report } e invalida ambas queries', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(
      screen.getByLabelText(/informe final del tratamiento/i),
      'Tratamiento finalizado con éxito',
    )
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    mockFetch.mockClear()
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plan: makeDischargedPlan() }),
        })
      }
      // refetch del GET tras la invalidación → plan dado de alta
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ plan: makeDischargedPlan() }),
      })
    })

    await user.click(screen.getByRole('button', { name: /confirmar alta/i }))

    // Tras el éxito + invalidación, el panel re-renderiza en SOLO LECTURA
    await waitFor(() => {
      expect(screen.getByText(/alta: 11 de junio de 2026/i)).toBeInTheDocument()
    })

    const postCall = mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(postCall![0]).toBe(`/api/treatments/${TREATMENT_ID}/discharge`)
    const body = JSON.parse(postCall![1].body as string)
    expect(body).toEqual({ discharge_report: 'Tratamiento finalizado con éxito' })
    // discharge_at NUNCA viaja del cliente (server time — anti-backdating)
    expect(body).not.toHaveProperty('discharge_at')

    // La invalidación del GET refetcheó el plan (read-only visible) — y el form ya no está
    expect(screen.queryByLabelText(/motivo de consulta/i)).not.toBeInTheDocument()
  })

  it('error del server (409/500) → muestra el mensaje del server', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/informe final del tratamiento/i), 'Informe')
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error:
                'El informe final se guardó pero no se pudo marcar el tratamiento como completado. Reintentá el alta.',
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: makePlan() }) })
    })

    await user.click(screen.getByRole('button', { name: /confirmar alta/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/el informe final se guardó pero no se pudo marcar/i),
      ).toBeInTheDocument()
    })
  })

  it('error sin body JSON → mensaje genérico', async () => {
    const user = userEvent.setup()
    mockGetPlan(makePlan())
    await expandPanel()

    await waitFor(() => {
      expect(screen.getByLabelText(/informe final del tratamiento/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/informe final del tratamiento/i), 'Informe')
    await user.click(screen.getByRole('button', { name: /dar el alta/i }))

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('no json')) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: makePlan() }) })
    })

    await user.click(screen.getByRole('button', { name: /confirmar alta/i }))

    await waitFor(() => {
      expect(screen.getByText(/no se pudo dar el alta\. intentá de nuevo\./i)).toBeInTheDocument()
    })
  })
})

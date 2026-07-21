import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockUseCurrentTenant } = vi.hoisted(() => ({
  mockUseCurrentTenant: vi.fn(),
}))

vi.mock('@/hooks/use-current-tenant', () => ({
  useCurrentTenant: mockUseCurrentTenant,
}))

import { PatientClinicalDataPanel } from './PatientClinicalDataPanel'

const PATIENT_ID = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const API_URL = `/api/patients/${PATIENT_ID}/clinical-data`

let queryClient: QueryClient

function makeWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeClinicalData(overrides: Record<string, unknown> = {}) {
  return {
    antecedentes: 'HTA',
    alergias: 'Penicilina',
    medicacion: 'Enalapril 10mg',
    cirugias: 'Apendicectomía 2018',
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
  vi.useRealTimers()
})

function mockGetClinicalData(clinicalData: unknown) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const sent = JSON.parse(init.body as string) as Record<string, string>
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            clinical_data: {
              antecedentes: sent.antecedentes || null,
              alergias: sent.alergias || null,
              medicacion: sent.medicacion || null,
              cirugias: sent.cirugias || null,
            },
          }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clinical_data: clinicalData }),
    })
  })
}

function renderPanel(props: Partial<React.ComponentProps<typeof PatientClinicalDataPanel>> = {}) {
  return render(<PatientClinicalDataPanel patientId={PATIENT_ID} {...props} />, {
    wrapper: makeWrapper(),
  })
}

// Flush de microtasks + timers de 0ms dentro de act — para resolver la query de
// react-query cuando los fake timers están activos (waitFor no funciona con fake
// timers; el notifyManager de react-query agenda con setTimeout(0)).
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    }
  })
}

function putCalls() {
  return mockFetch.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT')
}

describe('PatientClinicalDataPanel — gating por rol (HCE, Ley 25.326)', () => {
  it('NO renderiza nada para un rol desconocido (ni toggle ni fetch)', () => {
    mockUseCurrentTenant.mockReturnValue({
      tenantId: 'tenant-1',
      role: 'otro',
      loading: false,
    })
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('NO renderiza nada mientras el rol carga', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: null, role: null, loading: true })
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('renderiza el toggle colapsado para doctor, sin fetch hasta expandir', () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: /contexto clínico de base/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('renderiza el toggle para admin', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'admin', loading: false })
    renderPanel()
    expect(screen.getByRole('button', { name: /contexto clínico de base/i })).toBeInTheDocument()
  })

  it('renderiza el toggle para receptionist (ISADI: recepción carga la ficha clínica)', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'receptionist', loading: false })
    renderPanel()
    expect(screen.getByRole('button', { name: /contexto clínico de base/i })).toBeInTheDocument()
  })
})

describe('PatientClinicalDataPanel — carga al expandir', () => {
  it('expandir → GET dedicado y textareas pobladas', async () => {
    mockGetClinicalData(makeClinicalData())
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Antecedentes')).toHaveValue('HTA')
    })
    expect(screen.getByLabelText('Alergias')).toHaveValue('Penicilina')
    expect(screen.getByLabelText('Medicación actual')).toHaveValue('Enalapril 10mg')
    expect(screen.getByLabelText('Cirugías')).toHaveValue('Apendicectomía 2018')
    expect(mockFetch).toHaveBeenCalledWith(API_URL)
  })

  it('GET con los 4 campos null (aún sin cargar) → textareas vacías listas para crear', async () => {
    mockGetClinicalData(
      makeClinicalData({ antecedentes: null, alergias: null, medicacion: null, cirugias: null }),
    )
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Antecedentes')).toHaveValue('')
    })
    expect(screen.getByLabelText('Alergias')).toHaveValue('')
    expect(screen.getByLabelText('Medicación actual')).toHaveValue('')
    expect(screen.getByLabelText('Cirugías')).toHaveValue('')
  })

  it('error del GET (p.ej. migración 042 sin aplicar en prod) → mensaje sin crash', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'column does not exist' }),
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/no se pudo cargar el contexto clínico/i)).toBeInTheDocument()
  })
})

describe('PatientClinicalDataPanel — readOnly (eliminación pendiente)', () => {
  it('textareas disabled y sin autosave al tipear', async () => {
    vi.useFakeTimers()
    mockGetClinicalData(makeClinicalData())
    renderPanel({ readOnly: true })
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()

    const antecedentes = screen.getByLabelText('Antecedentes')
    expect(antecedentes).toBeDisabled()
    expect(screen.getByLabelText('Alergias')).toBeDisabled()
    expect(screen.getByLabelText('Medicación actual')).toBeDisabled()
    expect(screen.getByLabelText('Cirugías')).toBeDisabled()
    // Sin botón de guardado en readOnly: no se puede persistir nada
    expect(screen.queryByRole('button', { name: /guardar contexto clínico/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/se guarda automáticamente/i)).not.toBeInTheDocument()

    // Aunque se fuerce un change, no hay PUT
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'X' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(0)
  })
})

describe('PatientClinicalDataPanel — guardado explícito por botón (sin autosave)', () => {
  async function setupExpanded(clinicalData: unknown = makeClinicalData()) {
    mockGetClinicalData(clinicalData)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()
    return screen.getByLabelText('Antecedentes')
  }

  function guardarBtn() {
    return screen.getByRole('button', { name: /guardar contexto clínico/i })
  }

  async function clickGuardar() {
    await act(async () => {
      fireEvent.click(guardarBtn())
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('escribir y esperar NO dispara ningún PUT (sin autosave)', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA y DBT2' } })
    })
    // Muy por encima del viejo debounce de 1200ms
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(0)
  })

  it('tipeo incremental con pausas no dispara un PUT por pausa', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    for (const parcial of ['H', 'HTA', 'HTA y DBT2']) {
      act(() => {
        fireEvent.change(antecedentes, { target: { value: parcial } })
      })
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })
    }
    expect(putCalls()).toHaveLength(0)
  })

  it('el botón dispara UN PUT con los 4 campos', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()
    const alergias = screen.getByLabelText('Alergias')

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA y DBT2' } })
    })
    act(() => {
      fireEvent.change(alergias, { target: { value: 'Ibuprofeno' } })
    })

    await clickGuardar()

    expect(putCalls()).toHaveLength(1)
    const [url, init] = putCalls()[0]
    expect(url).toBe(API_URL)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      antecedentes: 'HTA y DBT2',
      alergias: 'Ibuprofeno',
      medicacion: 'Enalapril 10mg',
      cirugias: 'Apendicectomía 2018',
    })
  })

  it('sin cambios respecto a lo cargado → el botón está deshabilitado', async () => {
    vi.useFakeTimers()
    await setupExpanded()

    expect(guardarBtn()).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(0)
  })

  it('al escribir se habilita el botón y aparece "Cambios sin guardar"', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Otra cosa' } })
    })

    expect(guardarBtn()).not.toBeDisabled()
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument()
  })

  it('doble click rápido en el botón hace un solo PUT', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Texto' } })
    })
    await act(async () => {
      const btn = guardarBtn()
      fireEvent.click(btn)
      fireEvent.click(btn)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(putCalls()).toHaveLength(1)
  })

  it('muestra "Guardado ✓" tras el PUT exitoso y limpia el cartel a los 2s', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Texto' } })
    })
    await clickGuardar()

    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByText('Guardado ✓')).not.toBeInTheDocument()
    // Ya no existe el cartel de autosave
    expect(screen.queryByText(/se guarda autom/i)).not.toBeInTheDocument()
  })

  it('PUT con error (p.ej. 042 sin aplicar) → mensaje de error; volver a tocar el botón reintenta', async () => {
    vi.useFakeTimers()
    let failPut = true
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        if (failPut) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'boom' }),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ clinical_data: makeClinicalData() }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            clinical_data: makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }),
          }),
      })
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()
    const antecedentes = screen.getByLabelText('Antecedentes')

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Texto' } })
    })
    await clickGuardar()
    expect(screen.getByText(/no se pudieron guardar los datos clínicos/i)).toBeInTheDocument()

    // El texto sigue sin guardarse → el botón queda habilitado para reintentar
    failPut = false
    expect(guardarBtn()).not.toBeDisabled()
    await clickGuardar()

    expect(putCalls()).toHaveLength(2)
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()
  })

  it('revertir el texto al valor original DESPUÉS de un guardado también se persiste (patch a — lastSaved)', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded(makeClinicalData())

    // Editar y guardar → lastSaved pasa a 'X'
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'X' } })
    })
    await clickGuardar()
    expect(putCalls()).toHaveLength(1)

    // Revertir EXACTAMENTE al valor cargado por el GET: debe contar como cambio
    // (si "último guardado" quedara fijo en los valores de montaje, el botón se
    // vería deshabilitado y el revert nunca llegaría al server → divergencia
    // silenciosa en HCE).
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA' } })
    })
    expect(guardarBtn()).not.toBeDisabled()
    await clickGuardar()

    expect(putCalls()).toHaveLength(2)
    expect(JSON.parse((putCalls()[1][1] as RequestInit).body as string)).toMatchObject({
      antecedentes: 'HTA',
    })
  })

  it('tras guardar, colapsar y re-expandir muestra los datos del server (patch b — setQueryData, sin GET extra)', async () => {
    vi.useFakeTimers()
    mockGetClinicalData(makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }))
    renderPanel()
    const toggle = screen.getByRole('button', { name: /contexto clínico de base/i })
    fireEvent.click(toggle)
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText('Antecedentes'), {
        target: { value: 'Texto nuevo' },
      })
    })
    await clickGuardar()

    // Colapsar y re-expandir: el editor debe remontar con los datos REALES guardados
    // (setQueryData del PUT), NO con los null viejos del GET inicial.
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    await flushMicrotasks()

    expect(screen.getByLabelText('Antecedentes')).toHaveValue('Texto nuevo')
    // Sin GET adicional: la cache quedó fresca vía setQueryData (1 solo GET inicial)
    const getCalls = mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method !== 'PUT',
    )
    expect(getCalls).toHaveLength(1)
  })

  // Con guardado explícito NO puede haber dos PUTs en vuelo (el botón se bloquea
  // mientras dura el guardado + guard inFlightRef), así que la carrera que el patch
  // (c) toleraba ahora se previene de raíz. saveSeqRef queda como defensa en
  // profundidad. Este test cubre la garantía observable: serialización.
  it('mientras un PUT está en vuelo el botón se bloquea y no se encadena otro (serialización — sustituye la carrera del patch c)', async () => {
    vi.useFakeTimers()
    let resolveFirstPut: ((value: unknown) => void) | null = null
    let putCount = 0
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putCount++
        if (putCount === 1) {
          return new Promise((resolve) => {
            resolveFirstPut = resolve
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              clinical_data: makeClinicalData({ antecedentes: 'VERSIÓN NUEVA' }),
            }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            clinical_data: makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }),
          }),
      })
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()
    const antecedentes = screen.getByLabelText('Antecedentes')

    // Guardado 1 → PUT 1 queda en vuelo (nunca resuelve todavía)
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'VERSIÓN VIEJA' } })
    })
    await clickGuardar()
    expect(putCalls()).toHaveLength(1)

    // Durante el vuelo: "Guardando…" y botón bloqueado, incluso si el usuario
    // sigue escribiendo (antes esto disparaba un segundo PUT concurrente).
    expect(screen.getByText('Guardando…')).toBeInTheDocument()
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'VERSIÓN NUEVA' } })
    })
    expect(guardarBtn()).toBeDisabled()
    await act(async () => {
      fireEvent.click(guardarBtn())
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(1) // sigue habiendo UN solo PUT

    // Al resolver el PUT 1, el panel se destraba y el texto nuevo puede guardarse
    await act(async () => {
      resolveFirstPut!({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ clinical_data: makeClinicalData({ antecedentes: 'VERSIÓN VIEJA' }) }),
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(guardarBtn()).not.toBeDisabled()
    await clickGuardar()
    expect(putCalls()).toHaveLength(2)
    const cached = queryClient.getQueryData<{ clinical_data: { antecedentes: string | null } }>([
      'patient-clinical-data',
      PATIENT_ID,
    ])
    expect(cached?.clinical_data.antecedentes).toBe('VERSIÓN NUEVA')
  })

  it('cleanup correcto — desmonta con texto sin guardar sin errores ni PUT tardío', async () => {
    vi.useFakeTimers()
    mockGetClinicalData(makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }))
    const { unmount } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText('Antecedentes'), { target: { value: 'X' } })
    })
    expect(() => unmount()).not.toThrow()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(putCalls()).toHaveLength(0)
  })
})

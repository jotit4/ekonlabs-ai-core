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
  it('NO renderiza nada para receptionist (ni toggle ni fetch)', () => {
    mockUseCurrentTenant.mockReturnValue({
      tenantId: 'tenant-1',
      role: 'receptionist',
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
    expect(mockFetch).toHaveBeenCalledWith(API_URL)
  })

  it('GET con los 3 campos null (aún sin cargar) → textareas vacías listas para crear', async () => {
    mockGetClinicalData(makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Antecedentes')).toHaveValue('')
    })
    expect(screen.getByLabelText('Alergias')).toHaveValue('')
    expect(screen.getByLabelText('Medicación actual')).toHaveValue('')
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
    // Sin indicador de autosave en readOnly
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

describe('PatientClinicalDataPanel — autosave con debounce 1200ms (fake timers)', () => {
  async function setupExpanded(clinicalData: unknown = makeClinicalData()) {
    mockGetClinicalData(clinicalData)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()
    return screen.getByLabelText('Antecedentes')
  }

  it('NO llama PUT antes de 1200ms', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA y DBT2' } })
    })
    act(() => {
      vi.advanceTimersByTime(1199)
    })
    expect(putCalls()).toHaveLength(0)
  })

  it('dispara UN PUT con los 3 campos tras 1200ms de pausa', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()
    const alergias = screen.getByLabelText('Alergias')

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA y DBT2' } })
    })
    act(() => {
      fireEvent.change(alergias, { target: { value: 'Ibuprofeno' } })
    })

    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
    })

    expect(putCalls()).toHaveLength(1)
    const [url, init] = putCalls()[0]
    expect(url).toBe(API_URL)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      antecedentes: 'HTA y DBT2',
      alergias: 'Ibuprofeno',
      medicacion: 'Enalapril 10mg',
    })
  })

  it('cada tipeo resetea el debounce (un solo PUT por pausa)', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'A' } })
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'AB' } })
    })
    act(() => {
      vi.advanceTimersByTime(800) // 1600ms desde el primer tipeo, 800 desde el último
    })
    expect(putCalls()).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(400) // completa los 1200 del último tipeo
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(1)
  })

  it('sin cambios respecto a lo cargado → no hay PUT', async () => {
    vi.useFakeTimers()
    await setupExpanded()

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(0)
  })

  it('muestra "Guardado ✓" tras el PUT exitoso y vuelve a idle a los 2s', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded()

    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Texto' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Se guarda automáticamente')).toBeInTheDocument()
  })

  it('PUT con error (p.ej. 042 sin aplicar) → mensaje de error; seguir tipeando reintenta', async () => {
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
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/no se pudieron guardar los datos clínicos/i)).toBeInTheDocument()

    // Reintento al seguir tipeando: nuevo debounce → nuevo PUT que ahora funciona
    failPut = false
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'Texto corregido' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(2)
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()
  })

  it('revertir el texto al valor original DESPUÉS de un guardado también se persiste (patch a — lastSavedRef)', async () => {
    vi.useFakeTimers()
    const antecedentes = await setupExpanded(makeClinicalData())

    // Editar → autosave 1 (lastSaved pasa a 'X')
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'X' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(1)

    // Revertir EXACTAMENTE al valor cargado por el GET → debe disparar autosave 2
    // (si la referencia quedara fija en los valores de montaje, este revert
    // nunca llegaría al server → divergencia silenciosa en HCE).
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'HTA' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })
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
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })

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

  it('respuesta de un PUT viejo que llega DESPUÉS de uno nuevo se descarta (patch c — saveSeqRef)', async () => {
    vi.useFakeTimers()
    // PUT 1: queda colgado hasta que lo resolvamos a mano. PUT 2: resuelve al toque.
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

    // Tipeo 1 → PUT 1 (queda en vuelo)
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'VERSIÓN VIEJA' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(1)

    // Tipeo 2 → PUT 2 (resuelve ok con "VERSIÓN NUEVA")
    act(() => {
      fireEvent.change(antecedentes, { target: { value: 'VERSIÓN NUEVA' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(2)
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()

    // Ahora resuelve el PUT 1 (obsoleto) con datos viejos y status de error:
    // NO debe pisar ni el status ni la cache (seq !== saveSeqRef.current → return).
    await act(async () => {
      resolveFirstPut!({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'obsoleto' }),
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    // El status sigue siendo el del PUT 2 ("Guardado ✓"), no error del PUT 1
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()
    expect(screen.queryByText(/no se pudieron guardar/i)).not.toBeInTheDocument()
    // La cache conserva la respuesta del PUT 2
    const cached = queryClient.getQueryData<{ clinical_data: { antecedentes: string | null } }>([
      'patient-clinical-data',
      PATIENT_ID,
    ])
    expect(cached?.clinical_data.antecedentes).toBe('VERSIÓN NUEVA')
  })

  it('cleanup correcto — desmonta sin errores con un debounce pendiente', async () => {
    vi.useFakeTimers()
    mockGetClinicalData(makeClinicalData({ antecedentes: null, alergias: null, medicacion: null }))
    const { unmount } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /contexto clínico de base/i }))
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText('Antecedentes'), { target: { value: 'X' } })
    })
    expect(() => unmount()).not.toThrow()
    // El timer pendiente quedó cancelado: avanzar no dispara PUT
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(putCalls()).toHaveLength(0)
  })
})

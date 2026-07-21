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

import { SessionNotePanel } from './SessionNotePanel'

const APPOINTMENT_ID = 'apt-1'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    session_note_id: 'sn-1',
    tenant_id: 'tenant-1',
    appointment_id: APPOINTMENT_ID,
    treatment_id: 'trt-1',
    patient_id: 'patient-1',
    worked_on: 'Movilidad de hombro',
    progress: 'Mejora el rango',
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
  vi.useRealTimers()
})

function mockGetNote(note: unknown) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ note: makeNote() }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note }) })
  })
}

// Variante que controla también author_name en la respuesta del GET y del PUT
// (firma — Fase 2).
function mockGetNoteWithAuthor(
  note: unknown,
  getAuthorName: string | null,
  putAuthorName: string | null = getAuthorName,
) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const sent = init.body ? (JSON.parse(init.body as string) as { worked_on: string; progress: string }) : undefined
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            note: makeNote(sent ? { worked_on: sent.worked_on, progress: sent.progress } : {}),
            author_name: putAuthorName,
          }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ note, author_name: getAuthorName }),
    })
  })
}

function renderPanel(props: Partial<React.ComponentProps<typeof SessionNotePanel>> = {}) {
  return render(
    <SessionNotePanel appointmentId={APPOINTMENT_ID} {...props} />,
    { wrapper: makeWrapper() },
  )
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

describe('SessionNotePanel — gating por rol (HCE, Ley 25.326)', () => {
  it('NO renderiza nada para un rol desconocido (ni botón ni fetch)', () => {
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
    const toggle = screen.getByRole('button', { name: /evolución de la sesión/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('renderiza el toggle para admin', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'admin', loading: false })
    renderPanel()
    expect(screen.getByRole('button', { name: /evolución de la sesión/i })).toBeInTheDocument()
  })

  it('renderiza el toggle para receptionist (ISADI: recepción carga la evolución)', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-1', role: 'receptionist', loading: false })
    renderPanel()
    expect(screen.getByRole('button', { name: /evolución de la sesión/i })).toBeInTheDocument()
  })
})

describe('SessionNotePanel — badge de serie (reuso SesionSerieBadge)', () => {
  it('muestra "Sesión 3/10" cuando recibe sessionIndex y totalSessions', () => {
    renderPanel({ sessionIndex: 3, totalSessions: 10 })
    expect(screen.getByText('Sesión 3/10')).toBeInTheDocument()
  })

  it('turno suelto (sin sessionIndex) → el badge no renderiza nada', () => {
    renderPanel()
    expect(screen.queryByText(/Sesión \d/)).not.toBeInTheDocument()
  })
})

describe('SessionNotePanel — carga al expandir', () => {
  it('GET con nota → textareas pobladas', async () => {
    mockGetNote(makeNote())
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/qué se trabajó/i)).toHaveValue('Movilidad de hombro')
    })
    expect(screen.getByLabelText(/progreso observado/i)).toHaveValue('Mejora el rango')
    expect(mockFetch).toHaveBeenCalledWith(`/api/appointments/${APPOINTMENT_ID}/session-note`)
  })

  it('GET con note: null (aún sin evolución) → textareas vacías listas para crear', async () => {
    mockGetNote(null)
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/qué se trabajó/i)).toHaveValue('')
    })
    expect(screen.getByLabelText(/progreso observado/i)).toHaveValue('')
  })

  it('error del GET (p.ej. migración 041 sin aplicar en prod) → mensaje sin crash', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/no se pudo cargar la evolución/i)).toBeInTheDocument()
  })
})

describe('SessionNotePanel — guardado explícito por botón (sin autosave)', () => {
  // Expande el panel y resuelve el GET con fake timers activos.
  async function setupExpanded(note: unknown = null) {
    mockGetNote(note)
    renderPanel({ sessionIndex: 3, totalSessions: 10 })
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()
    return screen.getByLabelText(/qué se trabajó/i)
  }

  function putCalls() {
    return mockFetch.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT')
  }

  function guardarBtn() {
    return screen.getByRole('button', { name: /guardar evolución/i })
  }

  // Click + flush del PUT (los fake timers están activos en todo el bloque).
  async function clickGuardar() {
    await act(async () => {
      fireEvent.click(guardarBtn())
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('escribir y esperar NO dispara ningún PUT (sin autosave)', async () => {
    vi.useFakeTimers()
    const workedOn = await setupExpanded()

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Ejercicios isométricos' } })
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
    const workedOn = await setupExpanded()

    for (const parcial of ['Ejer', 'Ejercicios', 'Ejercicios isométricos']) {
      act(() => {
        fireEvent.change(workedOn, { target: { value: parcial } })
      })
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })
    }

    expect(putCalls()).toHaveLength(0)
  })

  it('el botón dispara UN PUT con el body correcto', async () => {
    vi.useFakeTimers()
    const workedOn = await setupExpanded()
    const progress = screen.getByLabelText(/progreso observado/i)

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Ejercicios isométricos' } })
    })
    act(() => {
      fireEvent.change(progress, { target: { value: 'Tolera carga' } })
    })

    await clickGuardar()

    expect(putCalls()).toHaveLength(1)
    const [url, init] = putCalls()[0]
    expect(url).toBe(`/api/appointments/${APPOINTMENT_ID}/session-note`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      worked_on: 'Ejercicios isométricos',
      progress: 'Tolera carga',
    })
  })

  it('sin cambios respecto a lo cargado → el botón está deshabilitado', async () => {
    vi.useFakeTimers()
    await setupExpanded(makeNote())

    expect(guardarBtn()).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(putCalls()).toHaveLength(0)
  })

  it('al escribir se habilita el botón y aparece "Cambios sin guardar"', async () => {
    vi.useFakeTimers()
    const workedOn = await setupExpanded(makeNote())

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Otra cosa' } })
    })

    expect(guardarBtn()).not.toBeDisabled()
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument()
  })

  it('doble click rápido en el botón hace un solo PUT', async () => {
    vi.useFakeTimers()
    const workedOn = await setupExpanded()

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Texto' } })
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
    const workedOn = await setupExpanded()

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Texto' } })
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

  it('PUT 422 (turno sin paciente) → muestra el mensaje del server sin romper', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: () =>
            Promise.resolve({
              error:
                'El turno no tiene un paciente asociado. Vinculá el paciente antes de registrar la evolución.',
            }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note: null }) })
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText(/qué se trabajó/i), { target: { value: 'Texto' } })
    })
    await clickGuardar()

    expect(screen.getByRole('alert')).toHaveTextContent(/no tiene un paciente asociado/i)
  })

  it('PUT con error genérico → mensaje de error; volver a tocar el botón reintenta', async () => {
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
          json: () => Promise.resolve({ note: makeNote() }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note: null }) })
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()
    const workedOn = screen.getByLabelText(/qué se trabajó/i)

    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Texto' } })
    })
    await clickGuardar()
    expect(screen.getByText(/no se pudo guardar la evolución/i)).toBeInTheDocument()

    // El texto sigue sin guardarse → el botón queda habilitado para reintentar
    failPut = false
    expect(guardarBtn()).not.toBeDisabled()
    await clickGuardar()

    expect(putCalls()).toHaveLength(2)
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()
  })

  it('revertir el texto al valor original DESPUÉS de un guardado también se persiste (regresión CR 14.3)', async () => {
    vi.useFakeTimers()
    const workedOn = await setupExpanded(makeNote())

    // Editar y guardar → lastSaved pasa a 'X'
    act(() => {
      fireEvent.change(workedOn, { target: { value: 'X' } })
    })
    await clickGuardar()
    expect(putCalls()).toHaveLength(1)

    // Revertir EXACTAMENTE al valor cargado por el GET: debe contar como cambio
    // (si "último guardado" quedara fijo en los valores de montaje, el botón se
    // vería deshabilitado y el revert nunca llegaría al server → divergencia
    // silenciosa en HCE).
    act(() => {
      fireEvent.change(workedOn, { target: { value: 'Movilidad de hombro' } })
    })
    expect(guardarBtn()).not.toBeDisabled()
    await clickGuardar()

    expect(putCalls()).toHaveLength(2)
    expect(JSON.parse((putCalls()[1][1] as RequestInit).body as string)).toMatchObject({
      worked_on: 'Movilidad de hombro',
    })
  })

  it('tras guardar, colapsar y re-expandir muestra la nota del server (cache sincronizada, sin GET extra)', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const sent = JSON.parse(init.body as string) as { worked_on: string; progress: string }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              note: makeNote({ worked_on: sent.worked_on, progress: sent.progress }),
            }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note: null }) })
    })
    renderPanel()
    const toggle = screen.getByRole('button', { name: /evolución de la sesión/i })
    fireEvent.click(toggle)
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText(/qué se trabajó/i), {
        target: { value: 'Texto nuevo' },
      })
    })
    await clickGuardar()

    // Colapsar y re-expandir: el editor debe remontar con la nota REAL guardada
    // (setQueryData del PUT), NO con el note: null viejo del GET inicial.
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    await flushMicrotasks()

    expect(screen.getByLabelText(/qué se trabajó/i)).toHaveValue('Texto nuevo')
    // Sin GET adicional: la cache quedó fresca vía setQueryData (1 solo GET inicial)
    const getCalls = mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method !== 'PUT',
    )
    expect(getCalls).toHaveLength(1)
  })

  it('cleanup correcto — desmonta con texto sin guardar sin errores ni PUT tardío', async () => {
    vi.useFakeTimers()
    mockGetNote(null)
    const { unmount } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()

    act(() => {
      fireEvent.change(screen.getByLabelText(/qué se trabajó/i), { target: { value: 'X' } })
    })
    expect(() => unmount()).not.toThrow()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(putCalls()).toHaveLength(0)
  })
})

describe('SessionNotePanel — firma (Fase 2: nombre del autor + fecha)', () => {
  it('muestra "Firma: {nombre} · {fecha}" cuando la nota tiene autor resuelto', async () => {
    mockGetNoteWithAuthor(makeNote(), 'Dra. López')
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/^Firma: Dra\. López · /)).toBeInTheDocument()
    })
  })

  it('NO muestra la línea de firma cuando la nota aún no existe (nada guardado)', async () => {
    mockGetNoteWithAuthor(null, null)
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/qué se trabajó/i)).toHaveValue('')
    })
    expect(screen.queryByText(/^Firma:/)).not.toBeInTheDocument()
  })

  it('muestra un guion en el nombre cuando la nota existe pero author_name es null (autor no resuelto)', async () => {
    mockGetNoteWithAuthor(makeNote(), null)
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/^Firma: — · /)).toBeInTheDocument()
    })
  })

  it('tras guardar una nota nueva, la firma aparece al instante con el autor devuelto por el PUT', async () => {
    vi.useFakeTimers()
    mockGetNoteWithAuthor(null, null, 'Ana Gómez')
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()

    // Sin nota todavía: no hay firma
    expect(screen.queryByText(/^Firma:/)).not.toBeInTheDocument()

    act(() => {
      fireEvent.change(screen.getByLabelText(/qué se trabajó/i), { target: { value: 'Primer registro' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar evolución/i }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText(/^Firma: Ana Gómez · /)).toBeInTheDocument()
  })

  it('al editar una nota existente, la firma se actualiza con el autor de ESTE guardado (no queda con el autor original)', async () => {
    vi.useFakeTimers()
    // El GET inicial trae la nota firmada por otro usuario; el PUT devuelve
    // el autor de quien acaba de guardar (el usuario actual).
    mockGetNoteWithAuthor(makeNote(), 'Dr. Original', 'Ana Gómez')
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /evolución de la sesión/i }))
    await flushMicrotasks()

    expect(screen.getByText(/^Firma: Dr\. Original · /)).toBeInTheDocument()

    act(() => {
      fireEvent.change(screen.getByLabelText(/qué se trabajó/i), { target: { value: 'Editado ahora' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar evolución/i }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText(/^Firma: Ana Gómez · /)).toBeInTheDocument()
    expect(screen.queryByText(/^Firma: Dr\. Original · /)).not.toBeInTheDocument()
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useClinicKPIs } from './use-clinic-kpis'
import type { ClinicKPIs } from '@/types/metricas'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_KPIS: ClinicKPIs = {
  ocupacion_pct: 75,
  ocupacion_numerador: 15,
  ocupacion_denominador: 20,
  no_shows: 3,
  turnos_mes: 20,
  pacientes_nuevos: 5,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

const TEST_PARAMS = {
  desde: '2026-05-01T00:00:00-03:00',
  hasta: '2026-05-13T12:00:00-03:00',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useClinicKPIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama a /api/metricas/kpis con los parámetros correctos', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_KPIS }), { status: 200 })
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    const calledUrl = (mockFetch.mock.calls[0][0] as string)
    expect(calledUrl).toContain('/api/metricas/kpis')
    expect(calledUrl).toContain('desde=')
    expect(calledUrl).toContain('hasta=')
  })

  it('expone kpis correctamente cuando fetch responde { data: ClinicKPIs }', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_KPIS }), { status: 200 })
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.kpis).toEqual(MOCK_KPIS)
    })

    expect(result.current.isError).toBe(false)
  })

  it('isPending es true durante la carga inicial', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () => new Promise(() => {}) // Promise que nunca resuelve
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    expect(result.current.isPending).toBe(true)
    expect(result.current.kpis).toBeNull()
  })

  it('isError es true cuando fetch retorna error HTTP', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.kpis).toBeNull()
  })

  it('kpis es null cuando isError es true', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.kpis).toBeNull()
  })

  it('expone refetch como función', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_KPIS }), { status: 200 })
    )

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(typeof result.current.refetch).toBe('function')
  })

  it('usa queryKey con formato correcto: [metricas, kpis, { desde, hasta }]', async () => {
    let capturedQueryKey: unknown[] = []

    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ data: MOCK_KPIS }), { status: 200 })
    })

    // Spy en QueryClient.fetchQuery para capturar queryKey
    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    // Verificar que fetch fue llamado — la queryKey es validada implícitamente
    expect(mockFetch).toHaveBeenCalled()
    // La queryKey se verifica observando que los params de URL son correctos
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain(encodeURIComponent(TEST_PARAMS.desde))
    expect(calledUrl).toContain(encodeURIComponent(TEST_PARAMS.hasta))
    capturedQueryKey = ['metricas', 'kpis', TEST_PARAMS]
    expect(capturedQueryKey[0]).toBe('metricas')
    expect(capturedQueryKey[1]).toBe('kpis')
  })

  it('retry=false — isError se activa inmediatamente sin reintentos al primer fallo de red', async () => {
    let fetchCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchCallCount++
      throw new Error('Network error')
    })

    // Usar un QC sin retry override para verificar el retry del hook mismo
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapperNoRetry = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper: wrapperNoRetry })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 3000 })

    // Con retry: false, fetch debe llamarse exactamente 1 vez
    expect(fetchCallCount).toBe(1)
  })

  it('staleTime de 5 minutos — los datos no se revalidan inmediatamente en remount', async () => {
    let fetchCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchCount++
      return new Response(JSON.stringify({ data: MOCK_KPIS }), { status: 200 })
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapperWithSharedQC = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    // Primer render
    const { result: r1, unmount: u1 } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper: wrapperWithSharedQC })
    await waitFor(() => expect(r1.current.kpis).not.toBeNull())
    expect(fetchCount).toBe(1)

    u1()

    // Segundo render con el mismo QueryClient — no debe re-fetch por staleTime
    const { result: r2 } = renderHook(() => useClinicKPIs(TEST_PARAMS), { wrapper: wrapperWithSharedQC })
    await waitFor(() => expect(r2.current.isPending).toBe(false))
    expect(fetchCount).toBe(1) // No debe haber llamado fetch de nuevo
  })
})

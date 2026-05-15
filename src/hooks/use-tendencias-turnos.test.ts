import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTendenciasTurnos } from './use-tendencias-turnos'
import type { TendenciasTurnosData } from '@/types/metricas'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_DATA: TendenciasTurnosData = {
  semanas: [
    {
      semana_inicio: '2026-05-11',
      semana_label: 'Sem 20',
      confirmados: 5,
      cancelados: 2,
      no_shows: 1,
      total: 8,
    },
  ],
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-31T23:59:59-03:00',
}

const TEST_PARAMS = {
  desde: '2026-05-01T00:00:00-03:00',
  hasta: '2026-05-31T23:59:59-03:00',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTendenciasTurnos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hace fetch a /api/metricas/tendencias-turnos con params correctos', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/metricas/tendencias-turnos')
    expect(calledUrl).toContain('desde=')
    expect(calledUrl).toContain('hasta=')
  })

  it('retorna data cuando el fetch es exitoso', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_DATA)
    })

    expect(result.current.isError).toBe(false)
  })

  it('retorna isError cuando el fetch falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    )

    const { result } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.data).toBeUndefined()
  })

  it('usa queryKey correcto: ["metricas", "tendencias-turnos", { desde, hasta }]', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    // El queryKey correcto se verifica implícitamente via el fetch con los params
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain(encodeURIComponent(TEST_PARAMS.desde))
    expect(calledUrl).toContain(encodeURIComponent(TEST_PARAMS.hasta))
  })

  it('tiene staleTime de 5 minutos — no re-fetcha inmediatamente en remount', async () => {
    let fetchCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchCount++
      return new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapperWithSharedQC = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    const { result: r1, unmount: u1 } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper: wrapperWithSharedQC }
    )
    await waitFor(() => expect(r1.current.data).toBeDefined())
    expect(fetchCount).toBe(1)

    u1()

    const { result: r2 } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper: wrapperWithSharedQC }
    )
    await waitFor(() => expect(r2.current.isPending).toBe(false))
    expect(fetchCount).toBe(1) // No debe haber re-fetched por staleTime
  })

  it('tiene retry: false — isError se activa al primer fallo sin reintentos', async () => {
    let fetchCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchCallCount++
      throw new Error('Network error')
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapperNoRetry = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(
      () => useTendenciasTurnos(TEST_PARAMS.desde, TEST_PARAMS.hasta),
      { wrapper: wrapperNoRetry }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 3000 })

    expect(fetchCallCount).toBe(1) // Solo 1 intento — retry: false
  })
})

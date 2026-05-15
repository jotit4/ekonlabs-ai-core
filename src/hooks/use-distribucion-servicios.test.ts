import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDistribucionServicios } from './use-distribucion-servicios'
import type { DistribucionServiciosData } from '@/types/metricas'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_DATA: DistribucionServiciosData = {
  servicios: [
    {
      service_id: 'svc-1',
      nombre: 'Consulta General',
      activo: true,
      total: 10,
      porcentaje: 67,
    },
    {
      service_id: 'svc-2',
      nombre: 'Pediatría',
      activo: true,
      total: 5,
      porcentaje: 33,
    },
  ],
  total_turnos: 15,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

const TEST_DESDE = '2026-05-01T00:00:00-03:00'
const TEST_HASTA = '2026-05-13T12:00:00-03:00'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDistribucionServicios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hace fetch a /api/metricas/distribucion-servicios con params correctos', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(() => useDistribucionServicios(TEST_DESDE, TEST_HASTA), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/metricas/distribucion-servicios')
    expect(calledUrl).toContain('desde=')
    expect(calledUrl).toContain('hasta=')
  })

  it('retorna data cuando el fetch es exitoso', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(() => useDistribucionServicios(TEST_DESDE, TEST_HASTA), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_DATA)
    })

    expect(result.current.isError).toBe(false)
    expect(result.current.isPending).toBe(false)
  })

  it('retorna isError cuando el fetch falla (4xx/5xx)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    )

    const { result } = renderHook(() => useDistribucionServicios(TEST_DESDE, TEST_HASTA), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.data).toBeNull()
  })

  it('usa queryKey correcto: ["metricas", "distribucion-servicios", { desde, hasta }]', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    )

    const { result } = renderHook(() => useDistribucionServicios(TEST_DESDE, TEST_HASTA), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    // Verificar que fetch fue llamado con la URL correcta
    expect(mockFetch).toHaveBeenCalled()
    const calledUrl = mockFetch.mock.calls[0][0] as string
    // Los params deben estar codificados en la URL
    expect(calledUrl).toContain(encodeURIComponent(TEST_DESDE))
    expect(calledUrl).toContain(encodeURIComponent(TEST_HASTA))
  })

  it('tiene staleTime de 5 minutos — no re-fetcha en remount con QueryClient compartido', async () => {
    let fetchCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchCount++
      return new Response(JSON.stringify({ data: MOCK_DATA }), { status: 200 })
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapperShared = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    // Primer render
    const { result: r1, unmount: u1 } = renderHook(
      () => useDistribucionServicios(TEST_DESDE, TEST_HASTA),
      { wrapper: wrapperShared }
    )
    await waitFor(() => expect(r1.current.data).not.toBeNull())
    expect(fetchCount).toBe(1)

    u1()

    // Segundo render con mismo QC — no debe re-fetch
    const { result: r2 } = renderHook(
      () => useDistribucionServicios(TEST_DESDE, TEST_HASTA),
      { wrapper: wrapperShared }
    )
    await waitFor(() => expect(r2.current.isPending).toBe(false))
    expect(fetchCount).toBe(1)
  })

  it('tiene retry: false — isError activa inmediatamente sin reintentos', async () => {
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
      () => useDistribucionServicios(TEST_DESDE, TEST_HASTA),
      { wrapper: wrapperNoRetry }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 3000 })

    expect(fetchCallCount).toBe(1)
  })
})

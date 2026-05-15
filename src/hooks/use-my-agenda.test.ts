import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── vi.hoisted ─────────────────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.stubGlobal('fetch', mockFetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper }
}

function mockFetchSuccess(appointments: unknown[] = []) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: appointments }),
  })
}

function mockFetchError(status: number, error = 'Server error') {
  // retry: 1 → mock must fail twice (initial + one retry)
  const response = {
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  }
  mockFetch.mockResolvedValueOnce(response).mockResolvedValueOnce(response)
}

import { useMyAgenda } from './use-my-agenda'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useMyAgenda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama GET /api/appointments/mi-agenda?fecha={date} correctamente', async () => {
    mockFetchSuccess([])

    const { Wrapper } = makeWrapper()
    const { unmount } = renderHook(() => useMyAgenda('2026-05-14'), { wrapper: Wrapper })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/appointments/mi-agenda?fecha=2026-05-14'
      )
    })

    unmount()
  })

  it('retorna appointments al recibir { data: [...] }', async () => {
    const mockData = [
      {
        appointment_id: 'apt-1',
        professional_id: 'prof-1',
        start_at: '2026-05-14T10:00:00.000Z',
        end_at: '2026-05-14T11:00:00.000Z',
      },
    ]
    mockFetchSuccess(mockData)

    const { Wrapper } = makeWrapper()
    const { result, unmount } = renderHook(() => useMyAgenda('2026-05-14'), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.appointments).toHaveLength(1)
      expect(result.current.appointments[0].appointment_id).toBe('apt-1')
    })

    unmount()
  })

  it('isPending es true mientras carga', () => {
    // fetch nunca resuelve durante este test
    mockFetch.mockReturnValueOnce(new Promise(() => {}))

    const { Wrapper } = makeWrapper()
    const { result, unmount } = renderHook(() => useMyAgenda('2026-05-14'), { wrapper: Wrapper })

    expect(result.current.isPending).toBe(true)
    unmount()
  })

  it('isError es true y errorStatus es el status HTTP si la API falla con 500', async () => {
    mockFetchError(500, 'Error al obtener los turnos')

    const { Wrapper } = makeWrapper()
    const { result, unmount } = renderHook(() => useMyAgenda('2026-05-14'), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.errorStatus).toBe(500)
    unmount()
  })

  it('errorStatus es 404 si el profesional no existe', async () => {
    mockFetchError(404, 'Profesional no encontrado para este usuario')

    const { Wrapper } = makeWrapper()
    const { result, unmount } = renderHook(() => useMyAgenda('2026-05-14'), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.errorStatus).toBe(404)
    unmount()
  })
})

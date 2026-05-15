import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => {
  const mockFetch = vi.fn()
  return { mockFetch }
})

vi.stubGlobal('fetch', mockFetch)

import { useRetentionStatus } from './use-retention-status'
import type { RetentionStatusResult } from '@/types/retention'

// ── Wrapper ────────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
  return TestWrapper
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const okResult: RetentionStatusResult = {
  status: 'ok',
  data: {
    last_run_at: '2026-05-12T03:00:00Z',
    next_run_at: '2026-05-13T03:00:00Z',
    status: 'ok',
    records_purged_last_run: 42,
    error_message: null,
  },
}

const degradedResult: RetentionStatusResult = {
  status: 'degraded',
  data: null,
  message: 'FastAPI no disponible',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRetentionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama a /api/retention-status correctamente', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(okResult),
    })

    const wrapper = makeWrapper()
    renderHook(() => useRetentionStatus(), { wrapper })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/retention-status')
    })
  })

  it('expone result parseado cuando la API responde { status: "ok", data: ... }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(okResult),
    })

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useRetentionStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.result).toEqual(okResult)
    expect(result.current.result?.status).toBe('ok')
    expect(result.current.result?.data?.records_purged_last_run).toBe(42)
  })

  it('expone result.status === "degraded" cuando la API responde degradado', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(degradedResult),
    })

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useRetentionStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.result?.status).toBe('degraded')
    expect(result.current.result?.data).toBeNull()
  })

  it('isPending es true durante la carga inicial', () => {
    // La fetch nunca resuelve durante este test
    mockFetch.mockReturnValue(new Promise(() => {}))

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useRetentionStatus(), { wrapper })

    expect(result.current.isPending).toBe(true)
    expect(result.current.result).toBeNull()
  })

  it('isError es true cuando la API falla con response.ok === false', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal Server Error' }),
    })

    // El hook tiene retry: 1 — pero el QueryClient wrapper tiene retry: false.
    // En TanStack Query v5, el retry explícito del hook override el default del cliente.
    // Usamos retryDelay: 0 para acelerar el retry en tests.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    })
    function TestWrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client }, children)
    }
    const { result } = renderHook(() => useRetentionStatus(), { wrapper: TestWrapper })

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 5000 },
    )

    expect(result.current.result).toBeNull()
  })
})

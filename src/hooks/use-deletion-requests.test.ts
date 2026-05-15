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

import { useDeletionRequests } from './use-deletion-requests'
import type { DeletionRequestRow } from '@/types/deletion-requests'

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

const sampleRequest: DeletionRequestRow = {
  patient_id: 'p-uuid-1',
  full_name: 'Juan Pérez',
  dni: '12345678',
  deletion_requested_at: '2026-05-01T00:00:00Z',
  deletion_effective_at: '2026-05-31T00:00:00Z',
  status: 'pending',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeletionRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama a /api/patients/deletion-requests correctamente', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const wrapper = makeWrapper()
    renderHook(() => useDeletionRequests(), { wrapper })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/patients/deletion-requests')
    })
  })

  it('expone requests correctamente cuando fetch responde { data: [...] }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [sampleRequest] }),
    })

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useDeletionRequests(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.requests).toHaveLength(1)
    expect(result.current.requests[0].patient_id).toBe('p-uuid-1')
    expect(result.current.requests[0].status).toBe('pending')
  })

  it('isPending es true durante la carga inicial', () => {
    // La fetch nunca resuelve durante este test
    mockFetch.mockReturnValue(new Promise(() => {}))

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useDeletionRequests(), { wrapper })

    expect(result.current.isPending).toBe(true)
    expect(result.current.requests).toEqual([])
  })

  it('isError es true cuando fetch responde con HTTP 4xx/5xx (ok === false)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    })

    // Usar retryDelay: 0 para acelerar el retry en tests
    const client = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    })
    function TestWrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client }, children)
    }

    const { result } = renderHook(() => useDeletionRequests(), { wrapper: TestWrapper })

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 5000 },
    )

    expect(result.current.requests).toEqual([])
  })
})

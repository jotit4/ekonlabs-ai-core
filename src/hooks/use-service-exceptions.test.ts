import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useServiceExceptions } from './use-service-exceptions'
import type { ServiceException } from '@/types/servicios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SAMPLE_EXCEPTIONS: ServiceException[] = [
  {
    exception_id: 'exc-uuid-1',
    service_id: 'svc-1',
    tenant_id: 'tenant-1',
    exception_date: '2026-12-25',
    reason: 'Navidad',
    created_at: '2026-05-13T00:00:00Z',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useServiceExceptions', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama a /api/servicios/${serviceId}/excepciones', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_EXCEPTIONS }), { status: 200 })
    )

    const { result } = renderHook(() => useServiceExceptions('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.isPending).toBe(false) })

    expect(mockFetch).toHaveBeenCalledWith('/api/servicios/svc-1/excepciones')
  })

  it('expone exceptions cuando fetch responde correctamente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_EXCEPTIONS }), { status: 200 })
    )

    const { result } = renderHook(() => useServiceExceptions('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.exceptions).toHaveLength(1) })

    expect(result.current.exceptions[0].exception_id).toBe('exc-uuid-1')
    expect(result.current.isError).toBe(false)
  })

  it('isError true en respuesta 4xx/5xx', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }))

    const { result } = renderHook(() => useServiceExceptions('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.isError).toBe(true) }, { timeout: 5000 })

    expect(result.current.exceptions).toHaveLength(0)
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useDeleteServiceException } from './use-delete-service-exception'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeleteServiceException', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama DELETE /api/servicios/${serviceId}/excepciones/${exceptionId}', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceException(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', exceptionId: 'exc-1' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/servicios/svc-1/excepciones/exc-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('muestra toast.success cuando 204', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceException(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', exceptionId: 'exc-1' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Excepción eliminada')
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceException(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', exceptionId: 'exc-1' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al eliminar la excepción. Intentá de nuevo.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useDeleteServiceHour } from './use-delete-service-hour'

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

describe('useDeleteServiceHour', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama DELETE /api/servicios/${serviceId}/horarios/${hourId}', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceHour(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', hourId: 'hour-1' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/servicios/svc-1/horarios/hour-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('muestra toast.success cuando 204', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceHour(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', hourId: 'hour-1' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Horario eliminado')
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error al eliminar el horario' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteServiceHour(), { wrapper: Wrapper })

    await act(async () => { result.current.mutate({ serviceId: 'svc-1', hourId: 'hour-1' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al eliminar el horario. Intentá de nuevo.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })
})

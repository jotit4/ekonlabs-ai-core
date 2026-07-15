import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useSetDayStatus } from './use-set-day-status'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

const SAMPLE_RESPONSE = {
  data: {
    day_status_id: 'ds-1',
    tenant_id: 'tenant-1',
    status_date: '2026-12-25',
    is_open: false,
    reason: null,
    decided_by: 'user-1',
    decided_by_name: 'Ana Recepción',
    decided_at: '2026-12-01T00:00:00.000Z',
  },
}

describe('useSetDayStatus', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama POST /api/agenda/day-status con el payload', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSetDayStatus(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ date: '2026-12-25', is_open: false })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agenda/day-status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ date: '2026-12-25', is_open: false }),
      }),
    )
  })

  it('muestra toast.success "Día marcado como cerrado" cuando is_open=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSetDayStatus(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ date: '2026-12-25', is_open: false })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Día marcado como cerrado')
  })

  it('muestra toast.success "Día marcado como abierto" cuando is_open=true', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSetDayStatus(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ date: '2026-12-25', is_open: true })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Día marcado como abierto')
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error' }), { status: 500 }),
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSetDayStatus(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ date: '2026-12-25', is_open: false })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al guardar la decisión. Intentá de nuevo.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    )
  })

  it('invalida las queries ["agenda", "day-status"] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSetDayStatus(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ date: '2026-12-25', is_open: false })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agenda', 'day-status'] })
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useCreateServiceException } from './use-create-service-exception'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

const VALID_PAYLOAD = { exception_date: '2026-12-25', reason: 'Navidad' }

const SAMPLE_EXCEPTION = {
  exception_id: 'exc-1',
  service_id: 'svc-1',
  tenant_id: 'tenant-1',
  exception_date: '2026-12-25',
  reason: 'Navidad',
  created_at: '2026-05-13T00:00:00Z',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateServiceException', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama POST /api/servicios/${serviceId}/excepciones', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_EXCEPTION }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceException('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/servicios/svc-1/excepciones',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('muestra toast.success cuando éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_EXCEPTION }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceException('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Excepción agregada correctamente')
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceException('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al agregar la excepción. Intentá de nuevo.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })

  it('invalida [servicios, serviceId, excepciones] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_EXCEPTION }), { status: 201 })
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateServiceException('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['servicios', 'svc-1', 'excepciones'] })
  })
})

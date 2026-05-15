import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useCreateServiceHour } from './use-create-service-hour'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

const VALID_PAYLOAD = { day_of_week: 1 as const, start_time: '09:00', end_time: '18:00', slot_duration_minutes: 30 }

const SAMPLE_HOUR = {
  hour_id: 'hour-1',
  service_id: 'svc-1',
  tenant_id: 'tenant-1',
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '18:00:00',
  slot_duration_minutes: 30,
  active: true,
  created_at: '2026-05-13T00:00:00Z',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateServiceHour', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama POST /api/servicios/${serviceId}/horarios con body correcto', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HOUR }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceHour('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/servicios/svc-1/horarios',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_PAYLOAD),
      })
    )
  })

  it('muestra toast.success cuando éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HOUR }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceHour('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Horario agregado correctamente')
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error al crear el horario' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateServiceHour('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al agregar el horario. Intentá de nuevo.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })

  it('invalida [servicios, serviceId, horarios] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HOUR }), { status: 201 })
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateServiceHour('svc-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['servicios', 'svc-1', 'horarios'] })
  })
})

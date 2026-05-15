import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useServiceHours } from './use-service-hours'
import type { ServiceHour } from '@/types/servicios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SAMPLE_HOURS: ServiceHour[] = [
  {
    hour_id: 'hour-uuid-1',
    service_id: 'svc-1',
    tenant_id: 'tenant-1',
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '18:00:00',
    slot_duration_minutes: 30,
    active: true,
    created_at: '2026-05-13T00:00:00Z',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useServiceHours', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama a /api/servicios/${serviceId}/horarios', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HOURS }), { status: 200 })
    )

    const { result } = renderHook(() => useServiceHours('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.isPending).toBe(false) })

    expect(mockFetch).toHaveBeenCalledWith('/api/servicios/svc-1/horarios')
  })

  it('expone hours cuando fetch responde con { data: [...] }', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HOURS }), { status: 200 })
    )

    const { result } = renderHook(() => useServiceHours('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.hours).toHaveLength(1) })

    expect(result.current.hours[0].hour_id).toBe('hour-uuid-1')
    expect(result.current.isError).toBe(false)
  })

  it('isError true en respuesta 4xx/5xx', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }))

    const { result } = renderHook(() => useServiceHours('svc-1'), { wrapper })

    await waitFor(() => { expect(result.current.isError).toBe(true) }, { timeout: 5000 })

    expect(result.current.hours).toHaveLength(0)
  })
})

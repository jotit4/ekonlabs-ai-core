import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAvailability } from './use-availability'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SHIFT = {
  open: '09:00',
  close: '09:30',
  slot_start_iso: '2026-06-04T12:00:00Z',
  slot_end_iso: '2026-06-04T12:30:00Z',
  service_id: 'svc-1',
  service_name: 'Kinesiología',
  require_referral: false,
  professional_id: 'prof-1',
  professional_name: 'Dra. Pérez',
}

describe('useAvailability', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('hace fetch a /api/availability con los params esperados', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: { '2026-06-04': { available: true, shifts: [SHIFT] } } }), { status: 200 }),
    )

    const { result } = renderHook(
      () => useAvailability({ dateFrom: '2026-06-04', dateTo: '2026-06-04', serviceId: 'svc-1' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/availability')
    expect(url).toContain('date_from=2026-06-04')
    expect(url).toContain('date_to=2026-06-04')
    expect(url).toContain('service_id=svc-1')
  })

  it('transporta includeElapsedToday y lo separa en la query key', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ days: {} }), { status: 200 }),
    )

    const { result, rerender } = renderHook(
      ({ includeElapsedToday }: { includeElapsedToday: boolean }) =>
        useAvailability({
          dateFrom: '2026-07-30',
          dateTo: '2026-07-30',
          serviceId: 'svc-1',
          includeElapsedToday,
        }),
      { wrapper, initialProps: { includeElapsedToday: true } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(new URL(mockFetch.mock.calls[0][0] as string, 'http://localhost').searchParams.get(
      'include_elapsed_today',
    )).toBe('true')

    rerender({ includeElapsedToday: false })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(new URL(mockFetch.mock.calls[1][0] as string, 'http://localhost').searchParams.has(
      'include_elapsed_today',
    )).toBe(false)
  })

  it('expone daysShifts en modo shifts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: { '2026-06-04': { available: true, shifts: [SHIFT] } } }), { status: 200 }),
    )

    const { result } = renderHook(
      () => useAvailability({ dateFrom: '2026-06-04', dateTo: '2026-06-04' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.daysShifts['2026-06-04'].shifts).toHaveLength(1)
    expect(result.current.shiftsForDate('2026-06-04')).toHaveLength(1)
    expect(result.current.daysSummary).toEqual({})
  })

  it('expone daysSummary en modo summary', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: { '2026-06-04': { free_count: 3 } } }), { status: 200 }),
    )

    const { result } = renderHook(
      () => useAvailability({ dateFrom: '2026-06-01', dateTo: '2026-06-30', summary: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.daysSummary['2026-06-04']).toEqual({ free_count: 3 })
    expect(result.current.daysShifts).toEqual({})

    const url = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('summary=true')
  })

  it('isError cuando el fetch falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('err', { status: 500 }))

    const { result } = renderHook(
      () => useAvailability({ dateFrom: '2026-06-04', dateTo: '2026-06-04' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('no hace fetch cuando enabled=false', async () => {
    const mockFetch = vi.spyOn(global, 'fetch')
    renderHook(
      () => useAvailability({ dateFrom: '2026-06-04', dateTo: '2026-06-04', enabled: false }),
      { wrapper },
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ─── serviceIds (grupo — Pedido 1 ISADI 2026-07-16) ─────────────────────────
  describe('serviceIds (grupo de servicios)', () => {
    it('con serviceIds, envía service_ids=svc-1,svc-2 (grupo) en vez de service_id', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ days: {} }), { status: 200 }),
      )

      const { result } = renderHook(
        () =>
          useAvailability({
            dateFrom: '2026-06-04',
            dateTo: '2026-06-04',
            serviceIds: ['svc-1', 'svc-2'],
            allProfessionals: true,
          }),
        { wrapper },
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const url = mockFetch.mock.calls[0][0] as string
      const parsed = new URL(url, 'http://localhost')
      expect(parsed.searchParams.get('service_ids')).toBe('svc-1,svc-2')
      expect(parsed.searchParams.has('service_id')).toBe(false)
    })

    it('serviceIds vacío ([]) cae de vuelta a serviceId (comportamiento sin grupo)', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ days: {} }), { status: 200 }),
      )

      const { result } = renderHook(
        () =>
          useAvailability({
            dateFrom: '2026-06-04',
            dateTo: '2026-06-04',
            serviceId: 'svc-1',
            serviceIds: [],
          }),
        { wrapper },
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const url = mockFetch.mock.calls[0][0] as string
      const parsed = new URL(url, 'http://localhost')
      expect(parsed.searchParams.get('service_id')).toBe('svc-1')
      expect(parsed.searchParams.has('service_ids')).toBe(false)
    })
  })
})

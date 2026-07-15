import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDayStatusRange } from './use-day-status'
import type { DayStatusEntry } from '@/types/holidays'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SAMPLE_DAYS: Record<string, DayStatusEntry> = {
  '2026-12-25': {
    date: '2026-12-25',
    isHoliday: true,
    holidayName: 'Navidad',
    decisionIsOpen: null,
    decidedByName: null,
    decidedAt: null,
    reason: null,
    effectiveOpen: false,
  },
}

describe('useDayStatusRange', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama a /api/agenda/day-status con date_from y date_to', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: SAMPLE_DAYS }), { status: 200 }),
    )

    const { result } = renderHook(() => useDayStatusRange('2026-12-01', '2026-12-31'), { wrapper })

    await waitFor(() => { expect(result.current.isLoading).toBe(false) })

    expect(mockFetch).toHaveBeenCalledWith('/api/agenda/day-status?date_from=2026-12-01&date_to=2026-12-31')
  })

  it('expone days cuando fetch responde correctamente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: SAMPLE_DAYS }), { status: 200 }),
    )

    const { result } = renderHook(() => useDayStatusRange('2026-12-01', '2026-12-31'), { wrapper })

    await waitFor(() => { expect(Object.keys(result.current.days)).toHaveLength(1) })

    expect(result.current.days['2026-12-25'].holidayName).toBe('Navidad')
    expect(result.current.isError).toBe(false)
  })

  it('days = {} por defecto (sin días especiales)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ days: {} }), { status: 200 }),
    )

    const { result } = renderHook(() => useDayStatusRange('2026-01-01', '2026-01-07'), { wrapper })

    await waitFor(() => { expect(result.current.isLoading).toBe(false) })

    expect(result.current.days).toEqual({})
  })

  it('isError true en respuesta 4xx/5xx', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }))

    const { result } = renderHook(() => useDayStatusRange('2026-12-01', '2026-12-31'), { wrapper })

    await waitFor(() => { expect(result.current.isError).toBe(true) }, { timeout: 5000 })

    expect(result.current.days).toEqual({})
  })
})

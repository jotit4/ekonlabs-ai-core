import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProfessionalSchedules } from './use-professional-schedules'
import type { ProfessionalSchedule } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SAMPLE_SCHEDULES: ProfessionalSchedule[] = [
  {
    schedule_id: 'sched-uuid-1',
    professional_id: 'prof-1',
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '18:00:00',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProfessionalSchedules', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama a /api/profesionales/${professionalId}/horarios', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_SCHEDULES }), { status: 200 })
    )

    const { result } = renderHook(() => useProfessionalSchedules('prof-1'), { wrapper })

    await waitFor(() => { expect(result.current.isPending).toBe(false) })

    expect(mockFetch).toHaveBeenCalledWith('/api/profesionales/prof-1/horarios')
  })

  it('retorna array de schedules al recibir { data: [...] }', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_SCHEDULES }), { status: 200 })
    )

    const { result } = renderHook(() => useProfessionalSchedules('prof-1'), { wrapper })

    await waitFor(() => { expect(result.current.schedules).toHaveLength(1) })

    expect(result.current.schedules[0].schedule_id).toBe('sched-uuid-1')
    expect(result.current.isError).toBe(false)
  })

  it('isPending true mientras carga', async () => {
    let resolve: (value: Response) => void
    const pending = new Promise<Response>((res) => { resolve = res })

    vi.spyOn(global, 'fetch').mockReturnValueOnce(pending)

    const { result } = renderHook(() => useProfessionalSchedules('prof-1'), { wrapper })

    expect(result.current.isPending).toBe(true)

    // Resolver para limpiar
    resolve!(new Response(JSON.stringify({ data: [] }), { status: 200 }))
  })
})

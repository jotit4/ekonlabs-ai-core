import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useBlockedTimes } from './use-blocked-times'
import type { BlockedTime } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const SAMPLE_BLOCKED: BlockedTime[] = [
  {
    block_id: 'block-uuid-1',
    professional_id: 'prof-1',
    date_from: '2026-07-01',
    date_to: '2026-07-14',
    reason: 'Vacaciones',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBlockedTimes', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama a /api/profesionales/${professionalId}/bloqueos', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_BLOCKED }), { status: 200 })
    )

    const { result } = renderHook(() => useBlockedTimes('prof-1'), { wrapper })

    await waitFor(() => { expect(result.current.isPending).toBe(false) })

    expect(mockFetch).toHaveBeenCalledWith('/api/profesionales/prof-1/bloqueos')
  })

  it('retorna array de blockedTimes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_BLOCKED }), { status: 200 })
    )

    const { result } = renderHook(() => useBlockedTimes('prof-1'), { wrapper })

    await waitFor(() => { expect(result.current.blockedTimes).toHaveLength(1) })

    expect(result.current.blockedTimes[0].block_id).toBe('block-uuid-1')
    expect(result.current.isError).toBe(false)
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import { useCreateBlockedTime } from './use-create-blocked-time'
import type { CreateBlockedTimePayload } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper, invalidateSpy }
}

const VALID_PAYLOAD: CreateBlockedTimePayload = {
  date_from: '2026-07-01',
  date_to: '2026-07-14',
  reason: 'Vacaciones',
}

const SAMPLE_BLOCKED = {
  block_id: 'block-uuid-1',
  professional_id: 'prof-1',
  date_from: '2026-07-01',
  date_to: '2026-07-14',
  reason: 'Vacaciones',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateBlockedTime', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama POST /api/profesionales/${professionalId}/bloqueos con body correcto', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_BLOCKED }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateBlockedTime('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/profesionales/prof-1/bloqueos',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_PAYLOAD),
      })
    )
  })

  it('llama toast.success al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_BLOCKED }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateBlockedTime('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Período bloqueado registrado')
  })

  it('invalida [profesionales, professionalId, bloqueos] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_BLOCKED }), { status: 201 })
    )

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateBlockedTime('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'prof-1', 'bloqueos'] })
  })
})

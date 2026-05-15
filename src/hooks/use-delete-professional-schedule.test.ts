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

import { useDeleteProfessionalSchedule } from './use-delete-professional-schedule'

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeleteProfessionalSchedule', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama DELETE con URL correcta', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteProfessionalSchedule(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ professionalId: 'prof-1', scheduleId: 'sched-uuid-1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/profesionales/prof-1/horarios/sched-uuid-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('llama toast.success("Horario eliminado") al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteProfessionalSchedule(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ professionalId: 'prof-1', scheduleId: 'sched-uuid-1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Horario eliminado')
  })

  it('invalida [profesionales, professionalId, horarios] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useDeleteProfessionalSchedule(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ professionalId: 'prof-1', scheduleId: 'sched-uuid-1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'prof-1', 'horarios'] })
  })
})

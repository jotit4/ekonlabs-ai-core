import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { useProposeCorrection } from './use-knowledge-propose'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper, invalidateSpy }
}

const PROPOSAL = {
  suggested_topic: 'obras-sociales',
  is_new_topic: false,
  current_text: 'OSDE',
  proposed_text: 'OSDE y Swiss Medical',
  gap_questions: [],
  contradiction_warning: null,
}

describe('useProposeCorrection', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('POST /api/agente/knowledge/propose, devuelve la propuesta y NO invalida cache', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PROPOSAL), { status: 200 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useProposeCorrection(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ correction_note: 'agregar Swiss Medical' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agente/knowledge/propose',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.current.data).toEqual(PROPOSAL)
    // Efímero: nunca invalida nada.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('toast.error con acción "Reintentar" al fallar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), { status: 500 }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useProposeCorrection(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ correction_note: 'x' })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    )
  })
})

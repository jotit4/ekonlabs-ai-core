import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import {
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
} from './use-knowledge-mutations'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper, invalidateSpy }
}

const ENTRY = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  content: 'x',
  source_filename: 'general',
  chunk_index: 0,
  created_at: '2026-06-04T00:00:00Z',
}

describe('useCreateKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('POST /api/agente/knowledge, invalida ["agente","knowledge"] y toast.success', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(ENTRY), { status: 201 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateKnowledge(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ content: 'x' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agente/knowledge',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge'] })
    expect(toast.success).toHaveBeenCalled()
  })

  it('toast.error con acción "Reintentar" al fallar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), { status: 500 }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateKnowledge(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ content: 'x' })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      }),
    )
  })
})

describe('useUpdateKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('PATCH /api/agente/knowledge/:id, invalida y toast.success', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(ENTRY), { status: 200 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useUpdateKnowledge(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ id: ENTRY.id, content: 'nuevo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agente/knowledge/${ENTRY.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge'] })
    expect(toast.success).toHaveBeenCalled()
  })
})

describe('useDeleteKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('DELETE /api/agente/knowledge/:id, invalida y toast.success', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useDeleteKnowledge(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate(ENTRY.id)
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agente/knowledge/${ENTRY.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge'] })
    expect(toast.success).toHaveBeenCalled()
  })

  it('toast.error con "Reintentar" al fallar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), { status: 404 }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteKnowledge(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate(ENTRY.id)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    )
  })
})

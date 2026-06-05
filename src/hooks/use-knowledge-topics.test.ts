import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import {
  useKnowledgeTopics,
  useReindexTopic,
  useDeleteTopic,
} from './use-knowledge-topics'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper, invalidateSpy }
}

const TOPIC = {
  source_filename: 'obras-sociales',
  chunk_count: 2,
  content: 'OSDE se acepta',
  updated_at: '2026-06-04T00:00:00Z',
}

describe('useKnowledgeTopics', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('GET /api/agente/knowledge/topics y devuelve topics', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ topics: [TOPIC] }), { status: 200 }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useKnowledgeTopics(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(mockFetch).toHaveBeenCalledWith('/api/agente/knowledge/topics')
    expect(result.current.topics).toEqual([TOPIC])
  })
})

describe('useReindexTopic', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('PUT con source encodeado, invalida ambas keys y toast.success', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useReindexTopic(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ source: 'obras sociales', content: 'nuevo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agente/knowledge/topics/${encodeURIComponent('obras sociales')}`,
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge', 'topics'] })
    expect(toast.success).toHaveBeenCalled()
  })

  it('toast.error con "Reintentar" al fallar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), { status: 500 }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useReindexTopic(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ source: 'x', content: 'y' })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    )
  })
})

describe('useDeleteTopic', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('DELETE con source encodeado, invalida ambas keys y toast.success', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useDeleteTopic(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('obras-sociales')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agente/knowledge/topics/${encodeURIComponent('obras-sociales')}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'knowledge', 'topics'] })
    expect(toast.success).toHaveBeenCalled()
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useKnowledge } from './use-knowledge'
import type { KnowledgeEntry } from '@/types/agente'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const ENTRIES: KnowledgeEntry[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    content: 'OSDE se acepta',
    source_filename: 'obras-sociales',
    chunk_index: 0,
    created_at: '2026-06-04T00:00:00Z',
  },
]

describe('useKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('llama a /api/agente/knowledge y devuelve entries', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: ENTRIES }), { status: 200 }),
    )

    const { result } = renderHook(() => useKnowledge(), { wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith('/api/agente/knowledge')
    expect(result.current.entries).toEqual(ENTRIES)
    expect(result.current.isError).toBe(false)
  })

  it('entries es [] mientras carga', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() => new Promise(() => {}))
    const { result } = renderHook(() => useKnowledge(), { wrapper })
    expect(result.current.isPending).toBe(true)
    expect(result.current.entries).toEqual([])
  })

  it('isError cuando el fetch responde 5xx', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))

    const { result } = renderHook(() => useKnowledge(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })
    expect(result.current.entries).toEqual([])
  })
})

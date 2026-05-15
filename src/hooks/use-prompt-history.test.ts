import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { SystemPromptHistoryEntry } from '@/types/agente'

import { usePromptHistory } from './use-prompt-history'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

const SAMPLE_HISTORY: SystemPromptHistoryEntry[] = [
  {
    id: 'hist-1',
    tenant_id: 'tenant-1',
    user_id: 'admin-uuid-1',
    previous_content: 'anterior',
    new_content: 'nuevo',
    changed_at: '2026-05-12T10:00:00Z',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePromptHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama a /api/agente/prompt-history correctamente', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HISTORY }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePromptHistory(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith('/api/agente/prompt-history')
  })

  it('expone history correctamente cuando fetch responde { data: [...] }', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_HISTORY }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePromptHistory(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.history).toEqual(SAMPLE_HISTORY)
    expect(result.current.isError).toBe(false)
  })

  it('isPending es true durante carga inicial', () => {
    // Fetch que nunca resuelve para simular estado loading
    vi.spyOn(global, 'fetch').mockReturnValueOnce(new Promise(() => {}))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePromptHistory(), { wrapper: Wrapper })

    expect(result.current.isPending).toBe(true)
    expect(result.current.history).toEqual([])
  })

  it('isError es true cuando fetch responde con HTTP 4xx/5xx', async () => {
    // Mockear fetch para que falle todas las veces (intento + 1 retry = 2 llamadas)
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePromptHistory(), { wrapper: Wrapper })

    await waitFor(
      () => expect(result.current.isError).toBe(true),
      { timeout: 5000 }
    )

    expect(result.current.history).toEqual([])
    expect(result.current.isPending).toBe(false)
  })
})

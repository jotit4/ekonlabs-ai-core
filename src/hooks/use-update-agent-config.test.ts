import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { useUpdateAgentConfig } from './use-update-agent-config'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, Wrapper }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useUpdateAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama PATCH /api/agente/config con payload parcial', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { prompt_rules: 'reglas' } }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateAgentConfig(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ prompt_rules: 'reglas' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agente/config',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_rules: 'reglas' }),
      })
    )
  })

  it('muestra toast.success cuando la mutación tiene éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateAgentConfig(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ agent_name: 'Bot' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Configuración del agente guardada correctamente')
  })

  it('muestra toast.error con acción "Reintentar" cuando la mutación falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error al guardar la configuración' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateAgentConfig(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ prompt_rules: 'x' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      'Error al guardar.',
      expect.objectContaining({
        action: expect.objectContaining({
          label: 'Reintentar',
          onClick: expect.any(Function),
        }),
      })
    )
  })

  it('invalida [agente, config] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateAgentConfig(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ prompt_rules: 'ok' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'config'] })
  })
})

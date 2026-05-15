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
import { useUpdatePrompt } from './use-update-prompt'

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

describe('useUpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama PATCH /api/agente/config con body correcto', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { system_prompt_override: 'texto de prueba' } }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdatePrompt(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ system_prompt_override: 'texto de prueba' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agente/config',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt_override: 'texto de prueba' }),
      })
    )
  })

  it('muestra toast.success cuando la mutación tiene éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { system_prompt_override: 'ok' } }), { status: 200 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdatePrompt(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ system_prompt_override: 'ok' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toast.success).toHaveBeenCalledWith('Prompt guardado correctamente')
  })

  it('muestra toast.error cuando la mutación falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error al guardar el prompt' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdatePrompt(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ system_prompt_override: 'texto' })
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
      new Response(JSON.stringify({ data: { system_prompt_override: 'ok' } }), { status: 200 })
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdatePrompt(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ system_prompt_override: 'ok' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'config'] })
  })

  it('invalida [agente, prompt-history] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { system_prompt_override: 'ok' } }), { status: 200 })
    )

    const { qc, Wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdatePrompt(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ system_prompt_override: 'ok' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agente', 'prompt-history'] })
  })
})

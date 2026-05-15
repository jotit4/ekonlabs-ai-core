import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { wrapper: Wrapper, queryClient: qc }
}

function mockFetchSuccess(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  } as Response)
}

function mockFetchError(status = 500, errorBody = { error: 'update_failed' }) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => errorBody,
    status,
  } as unknown as Response)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useToggleShadowMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama PATCH /api/agente/shadow-mode con shadow_mode_enabled: true', async () => {
    const { wrapper } = makeWrapper()
    mockFetchSuccess({ data: { shadow_mode_enabled: true } })

    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/agente/shadow-mode',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ shadow_mode_enabled: true }),
        })
      )
    })
  })

  it('toast.success con "Shadow mode activado" cuando éxito con true', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper } = makeWrapper()
    mockFetchSuccess({ data: { shadow_mode_enabled: true } })

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Shadow mode activado')
      )
    })
  })

  it('toast.success con "Shadow mode desactivado" cuando éxito con false', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper } = makeWrapper()
    mockFetchSuccess({ data: { shadow_mode_enabled: false } })

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(false)
    })

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Shadow mode desactivado')
      )
    })
  })

  it('toast.error con "Reintentar" cuando falla', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper } = makeWrapper()
    mockFetchError(500)

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('Error al cambiar el modo shadow'),
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Reintentar' }),
        })
      )
    })
  })

  it('invalida [agente, config] en onSuccess', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper, queryClient } = makeWrapper()
    mockFetchSuccess({ data: { shadow_mode_enabled: true } })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['agente', 'config'] })
      )
    })
  })

  it('aplica optimistic update en onMutate', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper, queryClient } = makeWrapper()

    // Pre-poblar el cache
    const initialConfig = {
      tenant_id: 'test-tenant',
      shadow_mode_enabled: false,
      system_prompt_override: null,
      rules: {},
    }
    queryClient.setQueryData(['agente', 'config'], initialConfig)

    // Mock fetch que tarda para poder verificar el estado optimista
    let resolveFetch!: (value: unknown) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    // Verificar que el optimistic update se aplicó inmediatamente
    await waitFor(() => {
      const cached = queryClient.getQueryData<typeof initialConfig>(['agente', 'config'])
      expect(cached?.shadow_mode_enabled).toBe(true)
    })

    // Resolver el fetch para limpiar
    resolveFetch({ ok: true, json: async () => ({ data: { shadow_mode_enabled: true } }) })
  })

  it('revierte al valor anterior en onError', async () => {
    const { useToggleShadowMode } = await import('./use-toggle-shadow-mode')
    const { wrapper, queryClient } = makeWrapper()

    const initialConfig = {
      tenant_id: 'test-tenant',
      shadow_mode_enabled: false,
      system_prompt_override: null,
      rules: {},
    }
    queryClient.setQueryData(['agente', 'config'], initialConfig)

    mockFetchError(500)

    const { result } = renderHook(() => useToggleShadowMode(), { wrapper })

    act(() => {
      result.current.toggle(true)
    })

    await waitFor(() => {
      const cached = queryClient.getQueryData<typeof initialConfig>(['agente', 'config'])
      expect(cached?.shadow_mode_enabled).toBe(false)
    })
  })
})

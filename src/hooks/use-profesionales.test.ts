import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.stubGlobal('fetch', mockFetch)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper }
}

import { useProfesionales } from './use-profesionales'

describe('useProfesionales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama GET /api/profesionales', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    })
    renderHook(() => useProfesionales(), { wrapper: Wrapper })
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/profesionales')
    })
  })

  it('retorna la lista de profesionales al recibir { data: [...] }', async () => {
    const { Wrapper } = makeWrapper()
    const mockData = [
      { professional_id: 'prof-1', name: 'Patricia Pérez Bernal' },
      { professional_id: 'prof-2', name: 'Aldo Luque' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockData }),
    })
    const { result } = renderHook(() => useProfesionales(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.profesionales).toEqual(mockData)
  })

  it('isPending es true mientras carga', async () => {
    const { Wrapper } = makeWrapper()
    let resolvePromise: (val: unknown) => void = () => {}
    const neverResolvingFetch = new Promise((res) => {
      resolvePromise = res
    })
    mockFetch.mockReturnValueOnce(neverResolvingFetch)

    const { result } = renderHook(() => useProfesionales(), { wrapper: Wrapper })
    expect(result.current.isPending).toBe(true)
    // Cleanup
    resolvePromise({ ok: true, json: async () => ({ data: [] }) })
  })

  it('isError es true si la API falla', async () => {
    const { Wrapper } = makeWrapper()
    // El hook tiene retry: 1 — necesitamos fallar 2 veces para que isError sea true
    mockFetch.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useProfesionales(), { wrapper: Wrapper })
    // Usar timeout mayor para dar tiempo a los 2 intentos (retry: 1)
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })
    expect(result.current.profesionales).toEqual([])
  })
})

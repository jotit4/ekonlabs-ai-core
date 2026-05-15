import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── Mock sonner ───────────────────────────────────────────────────────────────

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: mockToastError,
  },
}))

import { useUpdateProfessionalServices } from './use-update-professional-services'

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

describe('useUpdateProfessionalServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('llama PUT /api/profesionales/:id/servicios con { service_ids: [...] }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { professional_id: 'prof-1', service_ids: ['svc-1', 'svc-2'] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessionalServices(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', service_ids: ['svc-1', 'svc-2'] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/profesionales/prof-1/servicios', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_ids: ['svc-1', 'svc-2'] }),
    }))
  })

  it('invalida [profesionales, list] al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { professional_id: 'prof-1', service_ids: [] },
      }),
    }))

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessionalServices(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', service_ids: [] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'list'] })
  })

  it('muestra toast.error cuando falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Error al actualizar servicios' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessionalServices(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', service_ids: ['svc-1'] })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Error al actualizar los servicios')
    )
  })

  it('acepta service_ids vacío para desasignar todos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { professional_id: 'prof-1', service_ids: [] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessionalServices(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', service_ids: [] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/profesionales/prof-1/servicios', expect.objectContaining({
      body: JSON.stringify({ service_ids: [] }),
    }))
  })
})

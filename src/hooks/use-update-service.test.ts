import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── Mock sonner ───────────────────────────────────────────────────────────────

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}))

import { useUpdateService } from './use-update-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_ID = 'svc-uuid-1'

const UPDATED_SERVICE = {
  service_id: SERVICE_ID,
  tenant_id: 'tenant-1',
  name: 'Kinesiología Actualizado',
  calendar_id: 'kin@cal.com',
  professional_name: null,
  duration_minutes: 45,
  active: true,
  booking_mode: 'gated' as const,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

  return { Wrapper, invalidateSpy }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useUpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama PATCH /api/servicios/${id} con body correcto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_SERVICE }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: SERVICE_ID, payload: { duration_minutes: 45 } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/servicios/${SERVICE_ID}`,
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: 45 }),
      })
    )

    vi.unstubAllGlobals()
  })

  it('muestra toast.success al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_SERVICE }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: SERVICE_ID, payload: { name: 'Nuevo nombre' } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Servicio actualizado correctamente')
    vi.unstubAllGlobals()
  })

  it('muestra toast.error con "Reintentar" cuando falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Error al actualizar el servicio' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: SERVICE_ID, payload: { active: false } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Error al actualizar el servicio'),
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('invalida [servicios, list] al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_SERVICE }),
    }))

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useUpdateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: SERVICE_ID, payload: { active: false } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['servicios', 'list'] })
    vi.unstubAllGlobals()
  })
})

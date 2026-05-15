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

import { useCreateService } from './use-create-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CREATED_SERVICE = {
  service_id: 'svc-uuid-new',
  tenant_id: 'tenant-1',
  name: 'Nuevo Servicio',
  calendar_id: 'nuevo@cal.com',
  professional_name: null,
  duration_minutes: 60,
  active: true,
  booking_mode: 'appointment' as const,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

  return { Wrapper, invalidateSpy }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama POST /api/servicios con body correcto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_SERVICE }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Nuevo Servicio', calendar_id: 'nuevo@cal.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/servicios', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nuevo Servicio', calendar_id: 'nuevo@cal.com' }),
    }))

    vi.unstubAllGlobals()
  })

  it('muestra toast.success cuando la mutación tiene éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_SERVICE }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Nuevo Servicio', calendar_id: 'nuevo@cal.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Servicio creado correctamente')
    vi.unstubAllGlobals()
  })

  it('muestra toast.error con acción "Reintentar" cuando falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Error al crear el servicio' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Nuevo Servicio', calendar_id: 'nuevo@cal.com' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Error al crear el servicio'),
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
    vi.unstubAllGlobals()
  })

  it('invalida [servicios, list] al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_SERVICE }),
    }))

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateService(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Nuevo Servicio', calendar_id: 'nuevo@cal.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['servicios', 'list'] })
    vi.unstubAllGlobals()
  })
})

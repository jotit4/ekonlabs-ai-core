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

import { useUpdateProfessional } from './use-update-professional'

// ── Helpers ───────────────────────────────────────────────────────────────────

const UPDATED_PROFESSIONAL = {
  professional_id: 'prof-1',
  tenant_id: 'tenant-1',
  name: 'Dr. García Actualizado',
  email: 'garcia@clinica.com',
  active: true,
  created_at: '2026-05-01T00:00:00Z',
}

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

describe('useUpdateProfessional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('llama PATCH /api/profesionales/:id con body correcto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_PROFESSIONAL }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({
        id: 'prof-1',
        payload: { name: 'Dr. García Actualizado' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/profesionales/prof-1', expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dr. García Actualizado' }),
    }))
  })

  it('muestra toast.success cuando la mutación tiene éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_PROFESSIONAL }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', payload: { name: 'Dr. García Actualizado' } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Profesional actualizado correctamente')
  })

  it('invalida [profesionales, list] al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: UPDATED_PROFESSIONAL }),
    }))

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', payload: { active: false } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'list'] })
  })

  it('muestra toast.error con acción "Reintentar" cuando falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Error al actualizar' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUpdateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ id: 'prof-1', payload: { name: 'Fallo' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Error al actualizar el profesional'),
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })
})

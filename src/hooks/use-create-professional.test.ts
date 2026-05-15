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

import { useCreateProfessional } from './use-create-professional'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CREATED_PROFESSIONAL = {
  professional_id: 'prof-new',
  tenant_id: 'tenant-1',
  name: 'Dr. Nuevo',
  email: 'nuevo@clinica.com',
  active: true,
  created_at: '2026-05-14T00:00:00Z',
  services: [],
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

describe('useCreateProfessional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('llama POST /api/profesionales con body correcto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_PROFESSIONAL }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Dr. Nuevo', email: 'nuevo@clinica.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/profesionales', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dr. Nuevo', email: 'nuevo@clinica.com' }),
    }))
  })

  it('muestra toast.success cuando la mutación tiene éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_PROFESSIONAL }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Dr. Nuevo', email: 'nuevo@clinica.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Profesional creado correctamente')
  })

  it('muestra toast.error con acción "Reintentar" cuando falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Error al crear el profesional' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Dr. Nuevo', email: 'nuevo@clinica.com' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Error al crear el profesional'),
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })

  it('invalida [profesionales, list] al tener éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: CREATED_PROFESSIONAL }),
    }))

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessional(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ name: 'Dr. Nuevo', email: 'nuevo@clinica.com' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'list'] })
  })
})

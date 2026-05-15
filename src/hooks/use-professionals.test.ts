import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { useProfessionals } from './use-professionals'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROFESSIONAL_LIST = [
  {
    professional_id: 'prof-1',
    tenant_id: 'tenant-1',
    name: 'Dr. García',
    email: 'garcia@clinica.com',
    active: true,
    created_at: '2026-05-01T00:00:00Z',
    services: [{ service_id: 'svc-1', name: 'Kinesiología' }],
  },
  {
    professional_id: 'prof-2',
    tenant_id: 'tenant-1',
    name: 'Dra. López',
    email: 'lopez@clinica.com',
    active: false,
    created_at: '2026-05-02T00:00:00Z',
    services: [],
  },
]

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProfessionals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('llama GET /api/profesionales correctamente', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: PROFESSIONAL_LIST }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useProfessionals(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(fetchMock).toHaveBeenCalledWith('/api/profesionales')
  })

  it('retorna array de profesionales al recibir { data: [...] }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: PROFESSIONAL_LIST }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useProfessionals(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.professionals).toHaveLength(2)
    expect(result.current.professionals[0].name).toBe('Dr. García')
    expect(result.current.professionals[1].name).toBe('Dra. López')
  })

  it('isPending es true mientras carga, false al completar', async () => {
    let resolve: (value: unknown) => void
    const promise = new Promise((r) => { resolve = r })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(promise))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useProfessionals(), { wrapper: Wrapper })

    expect(result.current.isPending).toBe(true)

    resolve!({
      ok: true,
      json: () => Promise.resolve({ data: PROFESSIONAL_LIST }),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.professionals).toHaveLength(2)
  })

  it('isError es true cuando la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    }))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useProfessionals(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.professionals).toEqual([])
  })
})

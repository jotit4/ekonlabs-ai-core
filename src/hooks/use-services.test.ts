import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { useServices } from './use-services'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_SERVICE = {
  service_id: 'svc-uuid-1',
  tenant_id: 'tenant-1',
  name: 'Kinesiología',
  calendar_id: 'kin@cal.com',
  professional_name: 'Patricia Pérez',
  duration_minutes: 60,
  active: true,
  booking_mode: 'gated' as const,
  capacity_per_slot: null,
  requires_prescription: false,
  is_referral_only: false,
  reminder_hours_before: null,
  reminder_instructions: null,
  prerequisite_note: null,
  created_at: '2026-05-01T00:00:00Z',
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama a /api/servicios correctamente', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [SAMPLE_SERVICE] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useServices(), { wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(fetchMock).toHaveBeenCalledWith('/api/servicios')
    vi.unstubAllGlobals()
  })

  it('expone services cuando fetch responde con { data: [...] }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [SAMPLE_SERVICE] }),
    }))

    const { result } = renderHook(() => useServices(), { wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0].name).toBe('Kinesiología')
    vi.unstubAllGlobals()
  })

  it('isPending es true durante la carga', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    const { result } = renderHook(() => useServices(), { wrapper })

    expect(result.current.isPending).toBe(true)
    vi.unstubAllGlobals()
  })

  it('isError es true cuando fetch responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    }))

    const { result } = renderHook(() => useServices(), { wrapper })

    // retry: 1 en el hook puede tardar más en marcar isError — esperar hasta 5s
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 5000 }
    )

    vi.unstubAllGlobals()
  })
})

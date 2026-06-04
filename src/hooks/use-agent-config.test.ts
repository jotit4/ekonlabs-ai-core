import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAgentConfig } from './use-agent-config'
import type { ClinicAgentConfig } from '@/types/agente'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_CONFIG: ClinicAgentConfig = {
  org_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  clinic_name: 'ISADI',
  agent_name: 'Asistente',
  prompt_rules: 'Reglas de prueba',
  ia_config: { tone_base: 'informal', tone_length: 2, features: { enable_cancel: true } },
  operations_config: { min_notice_hours: 2, future_window_days: 30 },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama a /api/agente/config correctamente', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_CONFIG }), { status: 200 })
    )

    const { result } = renderHook(() => useAgentConfig(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/agente/config')
  })

  it('expone config correctamente cuando fetch responde { data: {...} }', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_CONFIG }), { status: 200 })
    )

    const { result } = renderHook(() => useAgentConfig(), { wrapper })

    await waitFor(() => {
      expect(result.current.config).toEqual(MOCK_CONFIG)
    })

    expect(result.current.isError).toBe(false)
  })

  it('isPending es true durante la carga inicial', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () => new Promise(() => {}) // Promise pendiente — nunca resuelve
    )

    const { result } = renderHook(() => useAgentConfig(), { wrapper })

    expect(result.current.isPending).toBe(true)
    expect(result.current.config).toBeNull()
  })

  it('isError es true cuando fetch responde con HTTP 4xx/5xx', async () => {
    // El hook tiene retry: 1, así que necesitamos mockear 2 llamadas fallidas
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }))

    const { result } = renderHook(() => useAgentConfig(), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    }, { timeout: 5000 })

    expect(result.current.config).toBeNull()
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

import { useTenantConfig } from './use-tenant-config'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper }
}

describe('useTenantConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usesNativeCalendar es false por defecto mientras carga', () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    expect(result.current.usesNativeCalendar).toBe(false)
    expect(result.current.isPending).toBe(true)
    unmount()
  })

  it('usesNativeCalendar es false cuando la API retorna false', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uses_native_calendar: false }),
    })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.usesNativeCalendar).toBe(false)
    unmount()
  })

  it('usesNativeCalendar es true cuando la API retorna true', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uses_native_calendar: true }),
    })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.usesNativeCalendar).toBe(true)
    unmount()
  })

  it('usesNativeCalendar defaults a false si la API falla (fallback seguro)', async () => {
    const { Wrapper } = makeWrapper()
    // Mockear ambos intentos (retry: 1 → 2 intentos total)
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 3000 })
    expect(result.current.usesNativeCalendar).toBe(false)
    unmount()
  })

  it('hace fetch a /api/tenant/config', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uses_native_calendar: false }),
    })
    const { unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/tenant/config'))
    unmount()
  })
})

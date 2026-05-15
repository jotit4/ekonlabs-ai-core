import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useGCalChannelStatus } from './use-gcal-channel-status'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Ensure AbortSignal.timeout exists in jsdom and works with fake timers
vi.stubGlobal('AbortSignal', {
  ...AbortSignal,
  timeout: (/* ms */) => {
    const controller = new AbortController()
    return controller.signal
  },
  any: AbortSignal.any?.bind(AbortSignal),
})

describe('useGCalChannelStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('estado inicial es "unknown"', () => {
    // Fetch never resolves — check synchronous initial state only
    mockFetch.mockReturnValue(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useGCalChannelStatus())
    expect(result.current.status).toBe('unknown')
    unmount()
  })

  it('llama a GET /api/gcal/channel-status al montar', async () => {
    const { unmount } = renderHook(() => useGCalChannelStatus())

    await act(async () => {
      // Flush microtasks so fetch gets called
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/gcal/channel-status',
      expect.objectContaining({ signal: expect.anything() })
    )

    unmount()
  })

  it('actualiza a "healthy" cuando la API retorna { status: "healthy" }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    })

    const { result, unmount } = renderHook(() => useGCalChannelStatus())

    await act(async () => {
      // Multiple promise flushes to resolve: fetch -> res.json() -> setStatus
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.status).toBe('healthy')

    unmount()
  })

  it('actualiza a "degraded" cuando la API retorna { status: "degraded" }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'degraded' }),
    })

    const { result, unmount } = renderHook(() => useGCalChannelStatus())

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.status).toBe('degraded')

    unmount()
  })

  it('mantiene estado previo cuando fetch falla', async () => {
    // First call succeeds with 'healthy'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    })
    // Second call (interval) fails with network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result, unmount } = renderHook(() => useGCalChannelStatus())

    // Let initial fetch resolve
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.status).toBe('healthy')

    // Advance 5 minutes to trigger interval fetch that fails
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Status should remain 'healthy' — not degraded by failed status check
    expect(result.current.status).toBe('healthy')

    unmount()
  })

  it('el intervalo se limpia al desmontar (no quedan timers)', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useGCalChannelStatus())

    await act(async () => {
      await Promise.resolve()
    })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  describe('parámetro enabled', () => {
    it('cuando enabled=false, NO llama a fetch al montar', async () => {
      const { unmount } = renderHook(() => useGCalChannelStatus(false))
      await act(async () => {
        await Promise.resolve()
      })
      expect(mockFetch).not.toHaveBeenCalled()
      unmount()
    })

    it('cuando enabled=false, el status permanece "unknown"', async () => {
      const { result, unmount } = renderHook(() => useGCalChannelStatus(false))
      await act(async () => {
        await Promise.resolve()
      })
      expect(result.current.status).toBe('unknown')
      unmount()
    })
  })
})

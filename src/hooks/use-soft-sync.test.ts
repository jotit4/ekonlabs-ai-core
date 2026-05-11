import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Stub AbortSignal.timeout for jsdom
vi.stubGlobal('AbortSignal', {
  ...AbortSignal,
  timeout: (/* ms */) => {
    const controller = new AbortController()
    return controller.signal
  },
  any: AbortSignal.any?.bind(AbortSignal),
})

// Mock TanStack Query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

import { useSoftSync } from './use-soft-sync'

const VALID_PATIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

// Helper: make a fetch response
function makeFetchResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  })
}

describe('useSoftSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: successful fetch returning 'completed'
    mockFetch.mockReturnValue(makeFetchResponse({ status: 'completed' }))
  })

  it('estado inicial es "idle"', () => {
    // Fetch never resolves — check initial synchronous state only
    mockFetch.mockReturnValue(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useSoftSync())
    expect(result.current.status).toBe('idle')
    unmount()
  })

  it('trigger hace POST a /api/appointments/soft-sync con el patient_id correcto', async () => {
    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/appointments/soft-sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ patient_id: VALID_PATIENT_ID }),
      })
    )

    unmount()
  })

  it('estado pasa a "pending" cuando la API retorna { status: "pending" }', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ status: 'pending' }, 202))

    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(result.current.status).toBe('pending')
    unmount()
  })

  it('estado pasa a "completed" cuando la API retorna { status: "completed" }', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ status: 'completed' }))

    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(result.current.status).toBe('completed')
    unmount()
  })

  it('invalida ["agenda", "day", date] para cada fecha en affected_dates', async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse({ status: 'completed', affected_dates: ['2026-05-09', '2026-05-14'] })
    )

    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2)
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['agenda', 'day', '2026-05-09'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['agenda', 'day', '2026-05-14'] })

    unmount()
  })

  it('NO llama invalidateQueries cuando NO hay affected_dates', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ status: 'completed' }))

    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    unmount()
  })

  it('estado pasa a "error" cuando fetch falla — no lanza excepción', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result, unmount } = renderHook(() => useSoftSync())

    // Should not throw
    await act(async () => {
      await expect(result.current.trigger(VALID_PATIENT_ID)).resolves.toBeUndefined()
    })

    expect(result.current.status).toBe('error')
    unmount()
  })

  it('estado pasa a "error" cuando la API retorna status "error"', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ status: 'error', message: 'sync_unavailable' }, 503))

    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    expect(result.current.status).toBe('error')
    unmount()
  })

  it('el fetch usa /api/appointments/soft-sync — NO una URL con FASTAPI_BASE_URL', async () => {
    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/appointments/soft-sync')
    expect(url).not.toContain('FASTAPI_BASE_URL')
    expect(url).not.toContain('http://fastapi')

    unmount()
  })

  it('el payload enviado al proxy NO incluye tenant_id', async () => {
    const { result, unmount } = renderHook(() => useSoftSync())

    await act(async () => {
      await result.current.trigger(VALID_PATIENT_ID)
    })

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(callOptions.body as string) as Record<string, unknown>

    expect(sentBody).not.toHaveProperty('tenant_id')
    expect(sentBody).toHaveProperty('patient_id', VALID_PATIENT_ID)

    unmount()
  })
})

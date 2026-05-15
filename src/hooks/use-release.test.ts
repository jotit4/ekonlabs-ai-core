import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mocks hoisted
const {
  mockMutate,
  mockCancelQueries,
  mockGetQueriesData,
  mockSetQueriesData,
  mockSetQueryData,
  mockInvalidateQueries,
  mockUseMutation,
  mockToastError,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockCancelQueries: vi.fn(),
  mockGetQueriesData: vi.fn(),
  mockSetQueriesData: vi.fn(),
  mockSetQueryData: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockUseMutation: vi.fn(),
  mockToastError: vi.fn(),
}))

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => mockUseMutation(options),
  useQueryClient: () => ({
    cancelQueries: mockCancelQueries,
    getQueriesData: mockGetQueriesData,
    setQueriesData: mockSetQueriesData,
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useRelease } from './use-release'

describe('useRelease', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelQueries.mockResolvedValue(undefined)
    mockGetQueriesData.mockReturnValue([])
    mockSetQueriesData.mockReturnValue(undefined)
    mockSetQueryData.mockReturnValue(undefined)
    mockInvalidateQueries.mockResolvedValue(undefined)
  })

  it('llama a POST /api/conversaciones/${phone}/release al mutar', async () => {
    let capturedMutationFn: (() => Promise<unknown>) | undefined

    mockUseMutation.mockImplementation((options: { mutationFn: () => Promise<unknown> }) => {
      capturedMutationFn = options.mutationFn
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useRelease('+5491111111111'))

    // Simular fetch exitoso
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    await act(async () => {
      await capturedMutationFn?.()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/conversaciones/+5491111111111/release',
      { method: 'POST' }
    )
  })

  it('isPending es true durante la mutación', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: true })

    const { result } = renderHook(() => useRelease('+5491111111111'))

    expect(result.current.isPending).toBe(true)
  })

  it('en caso de éxito, invalida las queries ["conversations", "list"] y ["chatwoot", "messages", phone]', async () => {
    let capturedOnSuccess: (() => void) | undefined

    mockUseMutation.mockImplementation((options: { onSuccess: () => void }) => {
      capturedOnSuccess = options.onSuccess
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useRelease('+5491111111111'))

    await act(async () => {
      capturedOnSuccess?.()
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['conversations', 'list'] })
    )
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['chatwoot', 'messages', '+5491111111111'] })
    )
  })

  it('en caso de error de red, muestra toast de error con "Reintentar"', async () => {
    let capturedOnError: ((err: Error, variables: undefined, context: unknown) => void) | undefined

    mockUseMutation.mockImplementation((options: { onError: (err: Error, variables: undefined, context: unknown) => void }) => {
      capturedOnError = options.onError
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useRelease('+5491111111111'))

    const networkError = new Error('release_failed')

    act(() => {
      capturedOnError?.(networkError, undefined, { previousConversations: [] })
    })

    expect(mockToastError).toHaveBeenCalledWith(
      'Error al liberar al agente. Intentá de nuevo.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) })
    )
  })
})

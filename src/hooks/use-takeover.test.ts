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
  mockToastWarning,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockCancelQueries: vi.fn(),
  mockGetQueriesData: vi.fn(),
  mockSetQueriesData: vi.fn(),
  mockSetQueryData: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockUseMutation: vi.fn(),
  mockToastError: vi.fn(),
  mockToastWarning: vi.fn(),
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
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useTakeover } from './use-takeover'

describe('useTakeover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelQueries.mockResolvedValue(undefined)
    mockGetQueriesData.mockReturnValue([])
    mockSetQueriesData.mockReturnValue(undefined)
    mockSetQueryData.mockReturnValue(undefined)
    mockInvalidateQueries.mockResolvedValue(undefined)
  })

  it('llama a POST /api/conversaciones/${phone}/takeover al mutar', async () => {
    let capturedMutationFn: ((phone: string) => Promise<unknown>) | undefined

    mockUseMutation.mockImplementation((options: { mutationFn: (phone: string) => Promise<unknown> }) => {
      capturedMutationFn = options.mutationFn
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useTakeover())

    // Simular fetch exitoso
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    await act(async () => {
      await capturedMutationFn?.('+5491111111111')
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/conversaciones/+5491111111111/takeover',
      { method: 'POST' }
    )
  })

  it('isPending es true durante la mutación', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: true })

    const { result } = renderHook(() => useTakeover())

    expect(result.current.isPending).toBe(true)
  })

  it('en caso de éxito, invalida la query ["conversations", "list"]', async () => {
    let capturedOnSuccess: (() => void) | undefined

    mockUseMutation.mockImplementation((options: { onSuccess: () => void }) => {
      capturedOnSuccess = options.onSuccess
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useTakeover())

    await act(async () => {
      capturedOnSuccess?.()
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['conversations', 'list'] })
    )
  })

  it('en caso de error de red (no conflict), muestra toast de error', async () => {
    let capturedOnError: ((err: Error, phone: string, context: unknown) => void) | undefined

    mockUseMutation.mockImplementation((options: { onError: (err: Error, phone: string, context: unknown) => void }) => {
      capturedOnError = options.onError
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useTakeover())

    const networkError = new Error('takeover_failed')

    act(() => {
      capturedOnError?.(networkError, '+5491111111111', { previousConversations: [] })
    })

    expect(mockToastError).toHaveBeenCalledWith(
      'Error al asumir control. Intentá de nuevo.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) })
    )
  })

  it('en caso de 409 (conflict), muestra mensaje de conflicto', async () => {
    let capturedOnError: ((err: Error, phone: string, context: unknown) => void) | undefined

    mockUseMutation.mockImplementation((options: { onError: (err: Error, phone: string, context: unknown) => void }) => {
      capturedOnError = options.onError
      return { mutate: mockMutate, isPending: false }
    })

    renderHook(() => useTakeover())

    const conflictError = new Error('conflict')

    act(() => {
      capturedOnError?.(conflictError, '+5491111111111', { previousConversations: [] })
    })

    expect(mockToastWarning).toHaveBeenCalledWith(
      'Esta conversación ya está siendo atendida por otro operador'
    )
  })
})

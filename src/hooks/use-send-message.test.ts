import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mocks hoisted
const { mockMutate, mockInvalidateQueries, mockUseMutation, mockReset } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockUseMutation: vi.fn(),
  mockReset: vi.fn(),
}))

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => mockUseMutation(options),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useSendMessage } from './use-send-message'

const CONVERSATION_ID = '+5491111111111'

describe('useSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvalidateQueries.mockResolvedValue(undefined)
  })

  it('llama a POST /api/chatwoot/conversations/${conversationId}/messages/send con el content correcto', async () => {
    let capturedMutationFn: ((args: { content: string }) => Promise<unknown>) | undefined

    mockUseMutation.mockImplementation((options: { mutationFn: (args: { content: string }) => Promise<unknown> }) => {
      capturedMutationFn = options.mutationFn
      return { mutate: mockMutate, isPending: false, isError: false, reset: mockReset }
    })

    renderHook(() => useSendMessage(CONVERSATION_ID))

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    await act(async () => {
      await capturedMutationFn?.({ content: 'Hola paciente' })
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/chatwoot/conversations/${CONVERSATION_ID}/messages/send`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hola paciente' }),
      })
    )
  })

  it('isPending es true durante la mutación', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: true, isError: false, reset: mockReset })

    const { result } = renderHook(() => useSendMessage(CONVERSATION_ID))

    expect(result.current.isPending).toBe(true)
  })

  it('en caso de éxito, invalida la query ["chatwoot", "messages", conversationId]', async () => {
    let capturedOnSuccess: (() => void) | undefined

    mockUseMutation.mockImplementation((options: { onSuccess: () => void }) => {
      capturedOnSuccess = options.onSuccess
      return { mutate: mockMutate, isPending: false, isError: false, reset: mockReset }
    })

    renderHook(() => useSendMessage(CONVERSATION_ID))

    await act(async () => {
      capturedOnSuccess?.()
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['chatwoot', 'messages', CONVERSATION_ID] })
    )
  })

  it('en caso de error, isError es true', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false, isError: true, reset: mockReset })

    const { result } = renderHook(() => useSendMessage(CONVERSATION_ID))

    expect(result.current.isError).toBe(true)
  })

  it('reset() limpia el estado de error', async () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false, isError: true, reset: mockReset })

    const { result } = renderHook(() => useSendMessage(CONVERSATION_ID))

    act(() => {
      result.current.reset()
    })

    expect(mockReset).toHaveBeenCalledOnce()
  })
})

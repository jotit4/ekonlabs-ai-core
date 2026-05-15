import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mockear react-query completo
const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

import { useChatwootMessages } from './use-chatwoot-messages'

describe('useChatwootMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa query key ["chatwoot", "messages", conversationId]', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderHook(() => useChatwootMessages('conv-123'))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['chatwoot', 'messages', 'conv-123'],
      })
    )
  })

  it('retorna messages vacío cuando data es undefined', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('retorna messages de la data', () => {
    const mockMessages = [{ id: 1, content: 'Hola', message_type: 0, created_at: 1715000000 }]
    mockUseQuery.mockReturnValue({ data: { messages: mockMessages }, isLoading: false, isError: false })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('Hola')
  })

  it('isConnected es false cuando hay error', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.isConnected).toBe(false)
  })

  it('isConnected es true cuando fetch funciona', () => {
    mockUseQuery.mockReturnValue({ data: { messages: [] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.isConnected).toBe(true)
  })

  it('enabled es false cuando conversationId está vacío', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    renderHook(() => useChatwootMessages(''))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    )
  })

  it('refetchInterval es 10000 para polling', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    renderHook(() => useChatwootMessages('conv-123'))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ refetchInterval: 10_000 })
    )
  })

  it('isError es true cuando el fetch falla', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.isError).toBe(true)
  })

  it('isLoading es true durante fetch inicial', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { result } = renderHook(() => useChatwootMessages('conv-123'))
    expect(result.current.isLoading).toBe(true)
  })
})

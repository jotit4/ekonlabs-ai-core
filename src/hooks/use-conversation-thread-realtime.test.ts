import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// --- Mocks de Supabase ---
type PayloadCallback = () => void

const mockRemoveChannel = vi.fn()
let capturedInsertCallback: PayloadCallback | undefined

const mockChannelInstance = {
  on: vi.fn().mockImplementation(
    (_event: string, _filter: unknown, callback: PayloadCallback) => {
      capturedInsertCallback = callback
      return mockChannelInstance
    },
  ),
  subscribe: vi.fn().mockImplementation(() => mockChannelInstance),
}

const mockChannel = vi.fn().mockReturnValue(mockChannelInstance)

const mockSupabaseInstance = {
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabaseInstance,
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

import { useConversationThreadRealtime } from './use-conversation-thread-realtime'

describe('useConversationThreadRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedInsertCallback = undefined
    mockChannelInstance.on.mockImplementation(
      (_event: string, _filter: unknown, callback: PayloadCallback) => {
        capturedInsertCallback = callback
        return mockChannelInstance
      },
    )
    mockChannelInstance.subscribe.mockImplementation(() => mockChannelInstance)
  })

  it('no crea canal si phone está vacío', () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime(''))
    expect(mockChannel).not.toHaveBeenCalled()
    unmount()
  })

  it('crea canal con nombre único por phone', () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime('5491155555555'))
    expect(mockChannel).toHaveBeenCalledWith('conversation-thread-5491155555555')
    unmount()
  })

  it('suscribe a INSERT en tabla conversations con filter phone_number', () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime('5491155555555'))
    expect(mockChannelInstance.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'conversations',
        filter: 'phone_number=eq.5491155555555',
      }),
      expect.any(Function),
    )
    unmount()
  })

  it('invalida ["chatwoot", "messages", phone] al recibir INSERT', async () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime('5491155555555'))

    await waitFor(() => expect(capturedInsertCallback).toBeDefined())

    act(() => capturedInsertCallback!())

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['chatwoot', 'messages', '5491155555555'],
    })
    unmount()
  })

  it('llama removeChannel al desmontar', () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime('5491155555555'))
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })

  it('no invalida después de desmontar (mounted guard)', async () => {
    const { unmount } = renderHook(() => useConversationThreadRealtime('5491155555555'))
    await waitFor(() => expect(capturedInsertCallback).toBeDefined())

    unmount() // desmontado → mounted = false
    act(() => capturedInsertCallback!())

    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})

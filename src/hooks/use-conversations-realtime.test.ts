import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// --- Mocks de Supabase ---
type StatusCallback = (status: string) => void
type PayloadCallback = () => void

const mockRemoveChannel = vi.fn()

let capturedThreadStatesCallback: PayloadCallback | undefined
let capturedConversationsCallback: PayloadCallback | undefined
let capturedStatusCallback: StatusCallback | undefined

const mockChannelInstance = {
  on: vi.fn().mockImplementation(
    (_event: string, filter: { table: string }, callback: PayloadCallback) => {
      if (filter.table === 'thread_states') capturedThreadStatesCallback = callback
      if (filter.table === 'conversations') capturedConversationsCallback = callback
      return mockChannelInstance
    },
  ),
  subscribe: vi.fn().mockImplementation((cb?: StatusCallback) => {
    capturedStatusCallback = cb
    cb?.('SUBSCRIBED')
    return mockChannelInstance
  }),
}

const mockChannel = vi.fn().mockReturnValue(mockChannelInstance)

const mockGetSession = vi.fn().mockResolvedValue({
  data: {
    session: {
      access_token: 'mock.jwt.token',
    },
  },
})

const mockSupabaseInstance = {
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
  auth: {
    getSession: mockGetSession,
  },
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabaseInstance,
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: vi.fn().mockReturnValue({ tenant_id: 'tenant-123', app_role: 'admin' }),
}))

const mockInvalidateQueries = vi.fn()
const mockQueryClient = { invalidateQueries: mockInvalidateQueries }
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}))

import { parseJwtPayload } from '@/lib/utils/jwt'
import { useConversationsRealtime } from './use-conversations-realtime'

describe('useConversationsRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedThreadStatesCallback = undefined
    capturedConversationsCallback = undefined
    capturedStatusCallback = undefined
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'mock.jwt.token',
        },
      },
    })
    vi.mocked(parseJwtPayload).mockReturnValue({ tenant_id: 'tenant-123', app_role: 'admin' })
    mockChannelInstance.on.mockImplementation(
      (_event: string, filter: { table: string }, callback: PayloadCallback) => {
        if (filter.table === 'thread_states') capturedThreadStatesCallback = callback
        if (filter.table === 'conversations') capturedConversationsCallback = callback
        return mockChannelInstance
      },
    )
    mockChannelInstance.subscribe.mockImplementation((cb?: StatusCallback) => {
      capturedStatusCallback = cb
      cb?.('SUBSCRIBED')
      return mockChannelInstance
    })
  })

  it('isConnected inicia en false antes de recibir SUBSCRIBED', () => {
    // Estado inicial: false (fix M-24) — verificar antes de que getSession resuelva
    const mockGetSessionSlow = vi.fn().mockReturnValue(new Promise(() => {})) // nunca resuelve
    mockGetSession.mockImplementation(mockGetSessionSlow)

    const { result, unmount } = renderHook(() => useConversationsRealtime())
    expect(result.current.isConnected).toBe(false)
    unmount()
  })

  it('isConnected inicia en false y se setea en true al recibir SUBSCRIBED', async () => {
    const { result, unmount } = renderHook(() => useConversationsRealtime())

    // Estado inicial: false (fix M-24)
    expect(result.current.isConnected).toBe(false)

    // Esperar que getSession resuelva y el canal se cree con SUBSCRIBED
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    unmount()
  })

  it('se suscribe al canal "conversations-realtime" al montar', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('conversations-realtime')
    })

    unmount()
  })

  it('agrega filter tenant_id=eq.tenant-123 en .on() de thread_states', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(mockChannelInstance.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'thread_states',
          filter: 'tenant_id=eq.tenant-123',
        }),
        expect.any(Function),
      )
    })

    unmount()
  })

  it('agrega filter tenant_id=eq.tenant-123 en .on() de conversations', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(mockChannelInstance.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'conversations',
          filter: 'tenant_id=eq.tenant-123',
        }),
        expect.any(Function),
      )
    })

    unmount()
  })

  it('NO crea canal si tenantId es null', async () => {
    vi.mocked(parseJwtPayload).mockReturnValue(null)

    const { unmount } = renderHook(() => useConversationsRealtime())

    // Esperar que getSession resuelva
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockChannel).not.toHaveBeenCalled()
    unmount()
  })

  it('invalida ["conversations", "list"] cuando llega evento de thread_states', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(capturedThreadStatesCallback).toBeDefined()
    })

    capturedThreadStatesCallback!()
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] })
    unmount()
  })

  it('invalida ["conversations", "list"] cuando llega evento de conversations', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(capturedConversationsCallback).toBeDefined()
    })

    capturedConversationsCallback!()
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] })
    unmount()
  })

  it('llama removeChannel al desmontar (cleanup correcto)', async () => {
    const { unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('conversations-realtime')
    })

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })

  it('isConnected es false cuando status es CHANNEL_ERROR', async () => {
    const { result, unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(capturedStatusCallback).toBeDefined()
    })

    await act(async () => {
      capturedStatusCallback!('CHANNEL_ERROR')
    })
    expect(result.current.isConnected).toBe(false)
    unmount()
  })

  it('isConnected es false cuando status es CLOSED', async () => {
    const { result, unmount } = renderHook(() => useConversationsRealtime())

    await waitFor(() => {
      expect(capturedStatusCallback).toBeDefined()
    })

    await act(async () => {
      capturedStatusCallback!('CLOSED')
    })
    expect(result.current.isConnected).toBe(false)
    unmount()
  })
})

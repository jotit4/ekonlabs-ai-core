import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks de Supabase ──────────────────────────────────────────────────────────

type PayloadCallback = (payload: {
  new?: Record<string, string>
  old?: Record<string, string>
}) => void

const mockSubscribe = vi.fn().mockReturnThis()
const mockRemoveChannel = vi.fn()

let capturedCallback: PayloadCallback | undefined

const mockChannelInstance = {
  on: vi.fn().mockImplementation((_event: string, _filter: unknown, callback: PayloadCallback) => {
    capturedCallback = callback
    return { subscribe: mockSubscribe }
  }),
  subscribe: mockSubscribe,
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
  parseJwtPayload: vi.fn().mockReturnValue({ tenant_id: 'tenant-123' }),
}))

// ── Mock de react-query ─────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

import { parseJwtPayload } from '@/lib/utils/jwt'
import { useMyAgendaRealtime } from './use-my-agenda-realtime'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useMyAgendaRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCallback = undefined
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'mock.jwt.token',
        },
      },
    })
    vi.mocked(parseJwtPayload).mockReturnValue({ tenant_id: 'tenant-123' })

    mockChannelInstance.on.mockImplementation(
      (_event: string, _filter: unknown, callback: PayloadCallback) => {
        capturedCallback = callback
        return { subscribe: mockSubscribe }
      },
    )
    mockChannel.mockReturnValue(mockChannelInstance)
  })

  it('se suscribe al canal "appointments-mi-agenda-{isoDate}" al montar', async () => {
    const { unmount } = renderHook(() => useMyAgendaRealtime('2026-05-14'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-mi-agenda-2026-05-14')
    })

    expect(mockSubscribe).toHaveBeenCalled()
    unmount()
  })

  it('invalida ["mi-agenda", isoDate] cuando llega evento con start_at que coincide con isoDate', async () => {
    const { unmount } = renderHook(() => useMyAgendaRealtime('2026-05-14'))

    await waitFor(() => {
      expect(capturedCallback).toBeDefined()
    })

    capturedCallback!({
      new: { start_at: '2026-05-14T10:00:00+00:00', appointment_id: 'apt-1' },
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['mi-agenda', '2026-05-14'],
    })

    unmount()
  })

  it('NO invalida cuando el evento start_at pertenece a otra fecha', async () => {
    const { unmount } = renderHook(() => useMyAgendaRealtime('2026-05-14'))

    await waitFor(() => {
      expect(capturedCallback).toBeDefined()
    })

    capturedCallback!({
      new: { start_at: '2026-05-15T10:00:00+00:00', appointment_id: 'apt-2' },
    })

    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    unmount()
  })

  it('llama removeChannel al desmontar (cleanup correcto)', async () => {
    const { unmount } = renderHook(() => useMyAgendaRealtime('2026-05-14'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-mi-agenda-2026-05-14')
    })

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })

  it('NO crea canal si tenantId es null', async () => {
    vi.mocked(parseJwtPayload).mockReturnValue(null)

    const { unmount } = renderHook(() => useMyAgendaRealtime('2026-05-14'))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockChannel).not.toHaveBeenCalled()
    unmount()
  })
})

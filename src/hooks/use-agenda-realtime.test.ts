import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// --- Mocks de Supabase ---
type PayloadCallback = (payload: {
  new?: Record<string, string>
  old?: Record<string, string>
}) => void

const mockSubscribe = vi.fn().mockReturnThis()
const mockRemoveChannel = vi.fn()

// channel factory captura la última callback registrada
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

// --- Mock de react-query ---
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

import { parseJwtPayload } from '@/lib/utils/jwt'
import { useAgendaRealtime } from './use-agenda-realtime'

describe('useAgendaRealtime', () => {
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

    // Restablecer la implementación de mockChannelInstance.on para capturar callbacks correctamente
    mockChannelInstance.on.mockImplementation(
      (_event: string, _filter: unknown, callback: PayloadCallback) => {
        capturedCallback = callback
        return { subscribe: mockSubscribe }
      },
    )
    mockChannel.mockReturnValue(mockChannelInstance)
  })

  it('se suscribe al canal "appointments-changes-{isoDate}" al montar', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-07')
    })

    expect(mockSubscribe).toHaveBeenCalled()
    unmount()
  })

  it('agrega filter tenant_id=eq.tenant-123 en .on() de appointments', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(mockChannelInstance.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'appointments',
          filter: 'tenant_id=eq.tenant-123',
        }),
        expect.any(Function),
      )
    })

    unmount()
  })

  it('NO crea canal si tenantId es null', async () => {
    vi.mocked(parseJwtPayload).mockReturnValue(null)

    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockChannel).not.toHaveBeenCalled()
    unmount()
  })

  it('invalida ["agenda", "day", isoDate] cuando llega evento con start_at que coincide con isoDate', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(capturedCallback).toBeDefined()
    })

    // Simular evento de Supabase Realtime con start_at de la fecha correcta
    capturedCallback!({
      new: { start_at: '2026-05-07T10:00:00+00:00', appointment_id: 'apt-1' },
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['agenda', 'day', '2026-05-07'],
      exact: false,
    })

    unmount()
  })

  it('también invalida ["agenda", "range"] cuando hay cambio realtime', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(capturedCallback).toBeDefined()
    })

    capturedCallback!({
      new: { start_at: '2026-05-07T10:00:00+00:00', appointment_id: 'apt-1' },
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['agenda', 'range'],
      exact: false,
    })

    unmount()
  })

  it('NO invalida ["agenda", "day"] cuando el evento start_at pertenece a otra fecha, pero SÍ invalida ["agenda", "range"]', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(capturedCallback).toBeDefined()
    })

    // Evento de otra fecha — day no se invalida, pero range sí
    capturedCallback!({
      new: { start_at: '2026-05-08T10:00:00+00:00', appointment_id: 'apt-2' },
    })

    expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['agenda', 'day', '2026-05-07'] }),
    )
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['agenda', 'range'],
      exact: false,
    })

    unmount()
  })

  it('llama removeChannel al desmontar (cleanup correcto)', async () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-07')
    })

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })

  it('al cambiar isoDate, cancela el canal anterior y crea uno nuevo', async () => {
    const { rerender, unmount } = renderHook(
      ({ date }: { date: string }) => useAgendaRealtime(date),
      { initialProps: { date: '2026-05-07' } },
    )

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-07')
    })

    // Cambiar la fecha — debe limpiar el canal anterior y suscribirse al nuevo
    rerender({ date: '2026-05-08' })

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-08')
    })

    unmount()
  })
})

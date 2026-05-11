import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// --- Mocks de Supabase ---
type PayloadCallback = (payload: {
  new?: Record<string, string>
  old?: Record<string, string>
}) => void

const mockSubscribe = vi.fn().mockReturnThis()
const mockOn = vi.fn().mockReturnThis()
const mockRemoveChannel = vi.fn()

// channel factory captura la última callback registrada
let capturedCallback: PayloadCallback | undefined
const mockChannel = vi.fn((/* channelName */) => ({
  on: (_event: string, _filter: unknown, callback: PayloadCallback) => {
    capturedCallback = callback
    return { subscribe: mockSubscribe }
  },
  subscribe: mockSubscribe,
}))

const mockSupabaseInstance = {
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabaseInstance,
}))

// --- Mock de react-query ---
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

import { useAgendaRealtime } from './use-agenda-realtime'

describe('useAgendaRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCallback = undefined
    // Restablecer la implementación de mockChannel para capturar callbacks correctamente
    mockChannel.mockImplementation((/* channelName */) => ({
      on: (_event: string, _filter: unknown, callback: PayloadCallback) => {
        capturedCallback = callback
        return { subscribe: mockSubscribe }
      },
      subscribe: mockSubscribe,
    }))
  })

  it('se suscribe al canal "appointments-changes-{isoDate}" al montar', () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-07')
    expect(mockSubscribe).toHaveBeenCalled()

    unmount()
  })

  it('invalida ["agenda", "day", isoDate] cuando llega evento con start_at que coincide con isoDate', () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    expect(capturedCallback).toBeDefined()

    // Simular evento de Supabase Realtime con start_at de la fecha correcta
    capturedCallback!({
      new: { start_at: '2026-05-07T10:00:00+00:00', appointment_id: 'apt-1' },
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['agenda', 'day', '2026-05-07'],
    })

    unmount()
  })

  it('NO invalida cuando el evento start_at pertenece a otra fecha', () => {
    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))

    expect(capturedCallback).toBeDefined()

    // Evento de otra fecha — no debe invalidar
    capturedCallback!({
      new: { start_at: '2026-05-08T10:00:00+00:00', appointment_id: 'apt-2' },
    })

    expect(mockInvalidateQueries).not.toHaveBeenCalled()

    unmount()
  })

  it('llama removeChannel al desmontar (cleanup correcto)', () => {
    const channelInstance = { on: mockOn, subscribe: mockSubscribe }
    // Devolver instancia de canal capturada para pasarla a removeChannel
    mockChannel.mockImplementationOnce((/* channelName */) => {
      channelInstance.on = (_e: string, _f: unknown, cb: PayloadCallback) => {
        capturedCallback = cb
        return { subscribe: mockSubscribe }
      }
      return channelInstance
    })

    const { unmount } = renderHook(() => useAgendaRealtime('2026-05-07'))
    unmount()

    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })

  it('al cambiar isoDate, cancela el canal anterior y crea uno nuevo', () => {
    const { rerender, unmount } = renderHook(
      ({ date }: { date: string }) => useAgendaRealtime(date),
      { initialProps: { date: '2026-05-07' } }
    )

    expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-07')

    // Cambiar la fecha — debe limpiar el canal anterior y suscribirse al nuevo
    rerender({ date: '2026-05-08' })

    expect(mockRemoveChannel).toHaveBeenCalledOnce()
    expect(mockChannel).toHaveBeenCalledWith('appointments-changes-2026-05-08')

    unmount()
  })
})

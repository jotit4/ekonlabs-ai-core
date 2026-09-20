import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import React from 'react'

const { mockFetch, mockToastError } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockToastError: vi.fn(),
}))
vi.stubGlobal('fetch', mockFetch)

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}))

import { useAgendaViewPreference } from './use-agenda-view-preference'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper, qc }
}

describe('useAgendaViewPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('agendaView es null mientras carga', () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    expect(result.current.agendaView).toBeNull()
    expect(result.current.isPending).toBe(true)
    unmount()
  })

  it('expone la preferencia guardada tal como la devuelve la API', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { agenda_view: 'todos' } }) })
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.agendaView).toBe('todos')
    unmount()
  })

  it('agendaView es null cuando el usuario no tiene preferencia guardada', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.agendaView).toBeNull()
    unmount()
  })

  it('hace fetch a /api/me/preferences', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
    const { unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/me/preferences'))
    unmount()
  })

  it('setAgendaView actualiza el valor de forma optimista (antes de que responda el PATCH)', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { agenda_view: 'foco' } }) })
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.agendaView).toBe('foco'))

    // El PATCH queda pendiente (no resuelve todavía) — el valor debe cambiar
    // igual, de inmediato.
    mockFetch.mockReturnValueOnce(new Promise(() => {}))
    act(() => {
      result.current.setAgendaView('todos')
    })
    await waitFor(() => expect(result.current.agendaView).toBe('todos'))
    unmount()
  })

  it('si el guardado falla, revierte al valor anterior y avisa con un toast', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { agenda_view: 'foco' } }) })
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.agendaView).toBe('foco'))

    // El PATCH falla. El refetch posterior (onSettled → invalidateQueries)
    // queda COLGADO a propósito (nunca resuelve): así, si `agendaView` vuelve
    // a ser 'foco', es EXCLUSIVAMENTE por el rollback de onError (setQueryData
    // con el valor previo) — no porque un refetch exitoso lo haya "tapado".
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    mockFetch.mockReturnValueOnce(new Promise(() => {}))

    await act(async () => {
      result.current.setAgendaView('todos')
      // Deja correr el ciclo optimista → error → rollback.
      await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    })

    expect(mockToastError).toHaveBeenCalledWith('No se pudo guardar la preferencia. Intentá de nuevo.')
    // Sin esperar ningún refetch adicional: el rollback debe ser inmediato.
    expect(result.current.agendaView).toBe('foco')
    unmount()
  })

  it('en éxito, PATCH manda { agenda_view } con el valor elegido', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
    const { result, unmount } = renderHook(() => useAgendaViewPreference(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { agenda_view: 'todos' } }) })
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { agenda_view: 'todos' } }) })

    await act(async () => {
      result.current.setAgendaView('todos')
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/me/preferences',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ agenda_view: 'todos' }),
          }),
        ),
      )
    })
    unmount()
  })

  it('no consulta la preferencia cuando llega deshabilitado (cuenta sin foco)', async () => {
    const { Wrapper } = makeWrapper()
    const fetchSpy = vi.mocked(global.fetch)
    fetchSpy.mockClear()
    const { result, unmount } = renderHook(() => useAgendaViewPreference(false), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.agendaView).toBeNull())
    expect(fetchSpy).not.toHaveBeenCalled()
    unmount()
  })
})

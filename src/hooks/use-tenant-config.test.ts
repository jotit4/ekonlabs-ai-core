import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

import { useTenantConfig } from './use-tenant-config'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper }
}

describe('useTenantConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usesNativeCalendar es false por defecto mientras carga', () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    expect(result.current.usesNativeCalendar).toBe(false)
    expect(result.current.isPending).toBe(true)
    unmount()
  })

  it('usesNativeCalendar es false cuando la API retorna false', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        uses_native_calendar: false,
        agenda_area_focus: null,
        reception_groups: {},
        reception_default_group: null,
      }),
    })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.usesNativeCalendar).toBe(false)
    unmount()
  })

  it('usesNativeCalendar es true cuando la API retorna true', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        uses_native_calendar: true,
        agenda_area_focus: null,
        reception_groups: {},
        reception_default_group: null,
      }),
    })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.usesNativeCalendar).toBe(true)
    unmount()
  })

  it('usesNativeCalendar defaults a false si la API falla (fallback seguro)', async () => {
    const { Wrapper } = makeWrapper()
    // Mockear todos los intentos (retry: 2 → 3 intentos total)
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 6000 })
    expect(result.current.usesNativeCalendar).toBe(false)
    unmount()
  })

  it('hace fetch a /api/tenant/config', async () => {
    const { Wrapper } = makeWrapper()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        uses_native_calendar: false,
        agenda_area_focus: null,
        reception_groups: {},
        reception_default_group: null,
      }),
    })
    const { unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/tenant/config'))
    unmount()
  })

  // ── reception_groups / reception_default_group (tenants.rules, migración 069) ──
  describe('receptionGroups / receptionDefaultGroup', () => {
    it('receptionGroups es {} y receptionDefaultGroup es null por defecto mientras carga', () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      expect(result.current.receptionGroups).toEqual({})
      expect(result.current.receptionDefaultGroup).toBeNull()
      unmount()
    })

    it('expone receptionGroups y receptionDefaultGroup tal como los devuelve la API (ISADI)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uses_native_calendar: false,
          agenda_area_focus: 'rehab',
          reception_groups: {
            fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
            pileta: { label: 'Pileta', main_service_id: null },
            pilates: { label: 'Pilates', main_service_id: null },
          },
          reception_default_group: 'fisioterapia',
        }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.receptionGroups).toEqual({
        fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
        pileta: { label: 'Pileta', main_service_id: null },
        pilates: { label: 'Pilates', main_service_id: null },
      })
      expect(result.current.receptionDefaultGroup).toBe('fisioterapia')
      unmount()
    })

    it('receptionGroups es {} y receptionDefaultGroup es null cuando la cuenta no tiene el ajuste (cuenta demo)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uses_native_calendar: false,
          agenda_area_focus: null,
          reception_groups: {},
          reception_default_group: null,
        }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.receptionGroups).toEqual({})
      expect(result.current.receptionDefaultGroup).toBeNull()
      unmount()
    })

    it('receptionGroups es {} y receptionDefaultGroup es null si la API falla (fallback seguro)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 6000 })
      expect(result.current.receptionGroups).toEqual({})
      expect(result.current.receptionDefaultGroup).toBeNull()
      unmount()
    })
  })

  // ── agendaAreaFocus (tenants.rules.agenda_area_focus, migración 062) ───────
  describe('agendaAreaFocus', () => {
    it('es null por defecto mientras carga (AgendaView no debe recortar)', () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      expect(result.current.agendaAreaFocus).toBeNull()
      unmount()
    })

    it('es "rehab" cuando la API retorna agenda_area_focus: "rehab" (ISADI)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uses_native_calendar: false, agenda_area_focus: 'rehab' }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.agendaAreaFocus).toBe('rehab')
      unmount()
    })

    it('es null cuando la API retorna agenda_area_focus: null (tenant sin el ajuste)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uses_native_calendar: false, agenda_area_focus: null }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.agendaAreaFocus).toBeNull()
      unmount()
    })

    it('es null si la API falla (fallback seguro — no recorta)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 6000 })
      expect(result.current.agendaAreaFocus).toBeNull()
      unmount()
    })
  })

  // ── agendaAreaFocusLabel (tenants.rules.agenda_area_focus_label, migración 075) ──
  // Etiqueta visible del selector "Ver" de la agenda. A diferencia de
  // agendaAreaFocus, SIEMPRE resuelve a un string ('Rehabilitación' de
  // fallback) — no representa "sin ajuste".
  describe('agendaAreaFocusLabel', () => {
    it('es "Rehabilitación" por defecto mientras carga', () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      expect(result.current.agendaAreaFocusLabel).toBe('Rehabilitación')
      unmount()
    })

    it('expone la etiqueta que devuelve la API (ISADI)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uses_native_calendar: false,
          agenda_area_focus: 'rehab',
          agenda_area_focus_label: 'Rehabilitación',
        }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.agendaAreaFocusLabel).toBe('Rehabilitación')
      unmount()
    })

    it('cae a "Rehabilitación" si la API falla (fallback seguro)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 6000 })
      expect(result.current.agendaAreaFocusLabel).toBe('Rehabilitación')
      unmount()
    })
  })

  // ── isError / refetch (corrección de code review — High 2) ────────────────
  // Antes de esta corrección, el hook no exponía si la config había fallado:
  // AgendaView no tenía forma de distinguir "el tenant no tiene el ajuste" de
  // "no pudimos preguntarle a la API" y en ambos casos caía a "sin recorte" en
  // silencio. Ahora expone `isError`/`refetch` para que AgendaView pueda
  // mostrar el estado de error existente en vez de asumir "sin recorte".
  describe('isError / refetch', () => {
    it('isError es false cuando la API resuelve ok', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uses_native_calendar: false, agenda_area_focus: null }),
      })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.isError).toBe(false)
      unmount()
    })

    it('isError es true cuando la API falla persistentemente (agotados los reintentos)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 6000 })
      expect(result.current.isPending).toBe(false)
      unmount()
    })

    it('refetch() vuelve a pedir la config (permite reintentar tras un error)', async () => {
      const { Wrapper } = makeWrapper()
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      const { result, unmount } = renderHook(() => useTenantConfig(), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 6000 })

      const callsBeforeRefetch = mockFetch.mock.calls.length
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uses_native_calendar: false, agenda_area_focus: 'rehab' }),
      })
      await result.current.refetch()

      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBeforeRefetch)
      unmount()
    })
  })
})

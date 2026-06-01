import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mock de @refinedev/core ───────────────────────────────────────────────────

const mockUseList = vi.fn()

vi.mock('@refinedev/core', () => ({
  useList: (...args: unknown[]) => mockUseList(...args),
}))

// ── Mock de date-fns para control de fechas ───────────────────────────────────

vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>()
  return {
    ...actual,
    startOfDay: actual.startOfDay,
    endOfDay: actual.endOfDay,
    formatISO: actual.formatISO,
    parseISO: actual.parseISO,
  }
})

import { useAppointments } from './use-appointments'

const defaultUseListReturn = {
  query: { isPending: false, isError: false, refetch: vi.fn() },
  result: { data: [] },
  overtime: { elapsedTime: 0 },
}

describe('useAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseList.mockReturnValue(defaultUseListReturn)
  })

  it('llama useList con el recurso "appointments" y meta.select con professionals', () => {
    renderHook(() => useAppointments('2026-05-14'))
    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'appointments',
        meta: expect.objectContaining({
          select: expect.stringContaining('professionals(name)'),
        }),
      })
    )
  })

  it('meta.select incluye reminder_sent_at y attendance_confirmed (Story 12.4)', () => {
    renderHook(() => useAppointments('2026-05-14'))
    const call = mockUseList.mock.calls[0][0]
    expect(call.meta.select).toContain('reminder_sent_at')
    expect(call.meta.select).toContain('attendance_confirmed')
  })

  it('cuando NO hay filtros, el queryKey es ["agenda", "day", isoDate, "", ""]', () => {
    renderHook(() => useAppointments('2026-05-14'))
    const call = mockUseList.mock.calls[0][0]
    expect(call.queryOptions.queryKey).toEqual(['agenda', 'day', '2026-05-14', '', ''])
  })

  it('cuando se pasa professionalId, agrega filtro professional_id = eq(professionalId)', () => {
    renderHook(() => useAppointments('2026-05-14', { professionalId: 'prof-1' }))
    const call = mockUseList.mock.calls[0][0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'professional_id', operator: 'eq', value: 'prof-1' }),
      ])
    )
  })

  it('cuando se pasa serviceId, agrega filtro service_id = eq(serviceId)', () => {
    renderHook(() => useAppointments('2026-05-14', { serviceId: 'svc-1' }))
    const call = mockUseList.mock.calls[0][0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'service_id', operator: 'eq', value: 'svc-1' }),
      ])
    )
  })

  it('cuando ambos filtros son null, NO agrega filtros adicionales más allá de start_at', () => {
    renderHook(() => useAppointments('2026-05-14', { professionalId: null, serviceId: null }))
    const call = mockUseList.mock.calls[0][0]
    const filterFields = (call.filters as { field: string }[]).map((f) => f.field)
    expect(filterFields).not.toContain('professional_id')
    expect(filterFields).not.toContain('service_id')
  })

  it('el queryKey incluye professionalId y serviceId cuando están presentes', () => {
    renderHook(() =>
      useAppointments('2026-05-14', { professionalId: 'prof-1', serviceId: 'svc-1' })
    )
    const call = mockUseList.mock.calls[0][0]
    expect(call.queryOptions.queryKey).toEqual([
      'agenda', 'day', '2026-05-14', 'prof-1', 'svc-1',
    ])
  })

  it('retorna appointments vacíos cuando result.data es undefined', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      result: undefined,
    })
    const { result } = renderHook(() => useAppointments('2026-05-14'))
    expect(result.current.appointments).toEqual([])
  })

  it('retorna isLoading=true cuando query.isPending=true y no timeout', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      query: { isPending: true, isError: false, refetch: vi.fn() },
      overtime: { elapsedTime: 0 },
    })
    const { result } = renderHook(() => useAppointments('2026-05-14'))
    expect(result.current.isLoading).toBe(true)
  })

  it('retorna isError=true cuando query.isError=true', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      query: { isPending: false, isError: true, refetch: vi.fn() },
    })
    const { result } = renderHook(() => useAppointments('2026-05-14'))
    expect(result.current.isError).toBe(true)
  })

  it('retorna los filtros recibidos como parte del resultado', () => {
    const { result } = renderHook(() =>
      useAppointments('2026-05-14', { professionalId: 'prof-1', serviceId: 'svc-2' })
    )
    expect(result.current.professionalId).toBe('prof-1')
    expect(result.current.serviceId).toBe('svc-2')
  })
})

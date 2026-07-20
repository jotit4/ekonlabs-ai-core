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

import { useAppointmentsRange } from './use-appointments-range'

const defaultUseListReturn = {
  query: { isPending: false, isError: false, refetch: vi.fn() },
  result: { data: [] },
}

describe('useAppointmentsRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseList.mockReturnValue(defaultUseListReturn)
  })

  it('llama useList con resource "appointments" y filtros start_at gte/lte', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'appointments',
        filters: expect.arrayContaining([
          expect.objectContaining({ field: 'start_at', operator: 'gte' }),
          expect.objectContaining({ field: 'start_at', operator: 'lte' }),
        ]),
      })
    )
  })

  it('meta.select incluye reminder_sent_at y attendance_confirmed (Story 12.4)', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    const call = mockUseList.mock.calls[0][0]
    expect(call.meta.select).toContain('reminder_sent_at')
    expect(call.meta.select).toContain('attendance_confirmed')
  })

  it('siempre incluye el filtro is_walk_in=false (higiene Story 16.1 AC5)', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    const call = mockUseList.mock.calls[0][0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'is_walk_in', operator: 'eq', value: false }),
      ])
    )
  })

  it('queryKey es ["agenda", "range", dateFrom, dateTo, "", ""] sin filtros', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    const call = mockUseList.mock.calls[0][0]
    expect(call.queryOptions.queryKey).toEqual(['agenda', 'range', '2026-05-12', '2026-05-18', '', ''])
  })

  it('agrega filtro professional_id cuando se pasa professionalId', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18', { professionalId: 'prof-1' }))
    const call = mockUseList.mock.calls[0][0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'professional_id', operator: 'eq', value: 'prof-1' }),
      ])
    )
  })

  it('agrega filtro service_id cuando se pasa serviceId', () => {
    renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18', { serviceId: 'svc-1' }))
    const call = mockUseList.mock.calls[0][0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'service_id', operator: 'eq', value: 'svc-1' }),
      ])
    )
  })

  it('retorna appointments: [] cuando no hay data', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      result: undefined,
    })
    const { result } = renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    expect(result.current.appointments).toEqual([])
  })

  it('retorna isLoading=true cuando query.isPending=true', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      query: { isPending: true, isError: false, refetch: vi.fn() },
    })
    const { result } = renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    expect(result.current.isLoading).toBe(true)
  })

  it('retorna isError=true cuando query.isError=true', () => {
    mockUseList.mockReturnValue({
      ...defaultUseListReturn,
      query: { isPending: false, isError: true, refetch: vi.fn() },
    })
    const { result } = renderHook(() => useAppointmentsRange('2026-05-12', '2026-05-18'))
    expect(result.current.isError).toBe(true)
  })
})

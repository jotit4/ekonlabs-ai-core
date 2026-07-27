import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockInvalidateQueries, mockToast } = vi.hoisted(() => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  })
  return { mockInvalidateQueries: vi.fn(), mockToast: toastFn }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

vi.mock('sonner', () => ({ toast: mockToast }))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { useAppointmentActions } from './use-appointment-actions'

const DATE = '2026-07-27'

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    appointment_id: 'apt-1',
    patient_id: 'pat-1',
    package_id: null,
    patients: { full_name: 'Ramón Pérez' },
    ...overrides,
  } as unknown as Appointment
}

const okRes = { ok: true, status: 200, json: async () => ({}) }
const failRes = {
  ok: false,
  status: 500,
  json: async () => ({ error: 'La base rechazó el cambio' }),
}

/** ¿Se invalidó la agenda ENTERA (prefijo), no solo el día? */
function invalidoAgendaCompleta() {
  return mockInvalidateQueries.mock.calls.some(
    ([arg]) => Array.isArray(arg?.queryKey) && arg.queryKey.length === 1 && arg.queryKey[0] === 'agenda',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAppointmentActions — handleAttendanceSelect', () => {
  it('devuelve true y refresca TODA la agenda cuando el estado se aplica', async () => {
    mockFetch.mockResolvedValueOnce(okRes)
    const { result } = renderHook(() => useAppointmentActions(DATE))

    let aplicado: boolean | undefined
    await act(async () => {
      aplicado = await result.current.handleAttendanceSelect(makeAppointment(), 'completed')
    })

    expect(aplicado).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/appointments/apt-1/status')
    expect(JSON.parse(init.body)).toEqual({ status: 'completed' })
    // Semana y Mes leen de ['agenda','range',...]: invalidar solo el día las dejaba stale.
    expect(invalidoAgendaCompleta()).toBe(true)
  })

  it('devuelve false y avisa por toast si el PATCH falla (el host no debe cerrarse)', async () => {
    mockFetch.mockResolvedValueOnce(failRes)
    const { result } = renderHook(() => useAppointmentActions(DATE))

    let aplicado: boolean | undefined
    await act(async () => {
      aplicado = await result.current.handleAttendanceSelect(makeAppointment(), 'completed')
    })

    expect(aplicado).toBe(false)
    expect(mockToast.error).toHaveBeenCalledWith('La base rechazó el cambio')
  })

  it('con no_show de un turno de serie deriva al diálogo y no toca la API', async () => {
    const { result } = renderHook(() => useAppointmentActions(DATE))

    let aplicado: boolean | undefined
    await act(async () => {
      aplicado = await result.current.handleAttendanceSelect(
        makeAppointment({ package_id: 'pkg-1' }),
        'no_show',
      )
    })

    expect(aplicado).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.absenceTarget).toMatchObject({ action: 'no_show' })
  })

  it('completed de un turno de serie SÍ se aplica directo (no abre el diálogo)', async () => {
    mockFetch.mockResolvedValueOnce(okRes)
    const { result } = renderHook(() => useAppointmentActions(DATE))

    let aplicado: boolean | undefined
    await act(async () => {
      aplicado = await result.current.handleAttendanceSelect(
        makeAppointment({ package_id: 'pkg-1' }),
        'completed',
      )
    })

    expect(aplicado).toBe(true)
    expect(result.current.absenceTarget).toBeNull()
  })
})

describe('useAppointmentActions — handleCancelConfirm', () => {
  async function conTarget(apt: Appointment) {
    const hook = renderHook(() => useAppointmentActions(DATE))
    await act(async () => {
      hook.result.current.setCancelTarget(apt)
    })
    return hook
  }

  it('devuelve true, refresca agenda y disponibilidad, y limpia el target', async () => {
    mockFetch.mockResolvedValueOnce(okRes)
    const { result } = await conTarget(makeAppointment())

    let cancelado: boolean | undefined
    await act(async () => {
      cancelado = await result.current.handleCancelConfirm()
    })

    expect(cancelado).toBe(true)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ status: 'cancelled' })
    expect(invalidoAgendaCompleta()).toBe(true)
    // Cancelar libera el hueco: la disponibilidad en pantalla quedaría vieja.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['availability'],
      exact: false,
    })
    expect(result.current.cancelTarget).toBeNull()
    expect(mockToast.success).toHaveBeenCalledWith('Turno de Ramón Pérez cancelado.')
  })

  it('devuelve false y deja el error a la vista si el PATCH falla', async () => {
    mockFetch.mockResolvedValueOnce(failRes)
    const { result } = await conTarget(makeAppointment())

    let cancelado: boolean | undefined
    await act(async () => {
      cancelado = await result.current.handleCancelConfirm()
    })

    expect(cancelado).toBe(false)
    expect(result.current.cancelError).toBe('La base rechazó el cambio')
    // El target sigue vivo para poder reintentar sin volver a abrir nada.
    expect(result.current.cancelTarget).not.toBeNull()
  })

  it('con un turno de serie deriva al diálogo de decisión sin cancelar', async () => {
    const { result } = await conTarget(makeAppointment({ package_id: 'pkg-1' }))

    let cancelado: boolean | undefined
    await act(async () => {
      cancelado = await result.current.handleCancelConfirm()
    })

    expect(cancelado).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.absenceTarget).toMatchObject({ action: 'cancelled' })
    expect(result.current.cancelTarget).toBeNull()
  })

  it('sin turno elegido devuelve false y no llama a la API', async () => {
    const { result } = renderHook(() => useAppointmentActions(DATE))

    let cancelado: boolean | undefined
    await act(async () => {
      cancelado = await result.current.handleCancelConfirm()
    })

    expect(cancelado).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

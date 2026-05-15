import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks de hooks ────────────────────────────────────────────────────────────

const mockUseServiceHours = vi.fn()
const mockUseCreateServiceHour = vi.fn()
const mockUseDeleteServiceHour = vi.fn()
const mockUseServiceExceptions = vi.fn()
const mockUseCreateServiceException = vi.fn()
const mockUseDeleteServiceException = vi.fn()

vi.mock('@/hooks/use-service-hours', () => ({
  useServiceHours: (...args: unknown[]) => mockUseServiceHours(...args),
}))
vi.mock('@/hooks/use-create-service-hour', () => ({
  useCreateServiceHour: (...args: unknown[]) => mockUseCreateServiceHour(...args),
}))
vi.mock('@/hooks/use-delete-service-hour', () => ({
  useDeleteServiceHour: (...args: unknown[]) => mockUseDeleteServiceHour(...args),
}))
vi.mock('@/hooks/use-service-exceptions', () => ({
  useServiceExceptions: (...args: unknown[]) => mockUseServiceExceptions(...args),
}))
vi.mock('@/hooks/use-create-service-exception', () => ({
  useCreateServiceException: (...args: unknown[]) => mockUseCreateServiceException(...args),
}))
vi.mock('@/hooks/use-delete-service-exception', () => ({
  useDeleteServiceException: (...args: unknown[]) => mockUseDeleteServiceException(...args),
}))

import { ServiceHoursView } from './ServiceHoursView'
import type { ServiceHour, ServiceException } from '@/types/servicios'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_HOURS: ServiceHour[] = [
  {
    hour_id: 'hour-1',
    service_id: 'svc-1',
    tenant_id: 'tenant-1',
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '18:00:00',
    slot_duration_minutes: 30,
    active: true,
    created_at: '2026-05-13T00:00:00Z',
  },
  {
    hour_id: 'hour-2',
    service_id: 'svc-1',
    tenant_id: 'tenant-1',
    day_of_week: 3,
    start_time: '10:30:00',
    end_time: '17:00:00',
    slot_duration_minutes: 45,
    active: true,
    created_at: '2026-05-13T00:00:00Z',
  },
]

const SAMPLE_EXCEPTIONS: ServiceException[] = [
  {
    exception_id: 'exc-1',
    service_id: 'svc-1',
    tenant_id: 'tenant-1',
    exception_date: '2026-12-25',
    reason: 'Navidad',
    created_at: '2026-05-13T00:00:00Z',
  },
]

function setupDefaultMocks({
  hours = [] as ServiceHour[],
  hoursPending = false,
  hoursError = false,
  exceptions = [] as ServiceException[],
  exceptionsPending = false,
  exceptionsError = false,
} = {}) {
  const mutateHour = vi.fn()
  const mutateDeleteHour = vi.fn()
  const mutateException = vi.fn()
  const mutateDeleteException = vi.fn()

  mockUseServiceHours.mockReturnValue({
    hours,
    isPending: hoursPending,
    isError: hoursError,
    refetch: vi.fn(),
  })
  mockUseCreateServiceHour.mockReturnValue({
    mutate: mutateHour,
    isPending: false,
  })
  mockUseDeleteServiceHour.mockReturnValue({
    mutate: mutateDeleteHour,
    isPending: false,
  })
  mockUseServiceExceptions.mockReturnValue({
    exceptions,
    isPending: exceptionsPending,
    isError: exceptionsError,
    refetch: vi.fn(),
  })
  mockUseCreateServiceException.mockReturnValue({
    mutate: mutateException,
    isPending: false,
  })
  mockUseDeleteServiceException.mockReturnValue({
    mutate: mutateDeleteException,
    isPending: false,
  })

  return { mutateHour, mutateDeleteHour, mutateException, mutateDeleteException }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServiceHoursView', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra skeleton cuando isPending es true', () => {
    setupDefaultMocks({ hoursPending: true })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const skeleton = screen.getByRole('status', { name: 'Cargando horarios' })
    expect(skeleton).toBeInTheDocument()
    expect(skeleton.className).toContain('animate-pulse')
  })

  it('muestra banner de error + "Reintentar" cuando isError es true', () => {
    setupDefaultMocks({ hoursError: true })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText('Reintentar')).toBeInTheDocument()
  })

  it('muestra "No hay horarios configurados" cuando hours es []', () => {
    setupDefaultMocks({ hours: [] })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    expect(screen.getByText('No hay horarios configurados para este servicio')).toBeInTheDocument()
  })

  it('muestra lista de horarios con día, start_time y end_time', () => {
    setupDefaultMocks({ hours: SAMPLE_HOURS })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    // Día en español — puede aparecer también en el <select> del formulario, usar getAllByText
    expect(screen.getAllByText('Lunes').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Miércoles').length).toBeGreaterThanOrEqual(1)

    // Times sin segundos (HH:mm) — solo aparecen en la lista
    expect(screen.getByText('09:00 – 18:00')).toBeInTheDocument()
    expect(screen.getByText('10:30 – 17:00')).toBeInTheDocument()
  })

  it('muestra nombre de día en español con mapa local (no toLocaleDateString)', () => {
    setupDefaultMocks({
      hours: [
        {
          ...SAMPLE_HOURS[0],
          day_of_week: 0, // Domingo
        },
      ],
    })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)
    // Domingo aparece en la lista y en el <select> — al menos uno presente
    expect(screen.getAllByText('Domingo').length).toBeGreaterThanOrEqual(1)
  })

  it('muestra nota de timezone', () => {
    setupDefaultMocks()
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)
    expect(screen.getByText(/America\/Argentina\/Buenos_Aires/)).toBeInTheDocument()
  })

  it('submit de formulario de horario llama useCreateServiceHour.mutate', async () => {
    const { mutateHour } = setupDefaultMocks({ hours: [] })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    // Ajustar campos del formulario
    const startInput = screen.getByLabelText('Hora inicio')
    const endInput = screen.getByLabelText('Hora fin')
    fireEvent.change(startInput, { target: { value: '09:00' } })
    fireEvent.change(endInput, { target: { value: '18:00' } })

    const submitBtn = screen.getByRole('button', { name: 'Agregar horario' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mutateHour).toHaveBeenCalled()
    })
  })

  it('submit con end_time <= start_time muestra error inline, no llama mutate', async () => {
    const { mutateHour } = setupDefaultMocks({ hours: [] })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const startInput = screen.getByLabelText('Hora inicio')
    const endInput = screen.getByLabelText('Hora fin')
    fireEvent.change(startInput, { target: { value: '18:00' } })
    fireEvent.change(endInput, { target: { value: '09:00' } })

    const submitBtn = screen.getByRole('button', { name: 'Agregar horario' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('La hora de fin debe ser posterior a la hora de inicio')).toBeInTheDocument()
    })
    expect(mutateHour).not.toHaveBeenCalled()
  })

  it('botón "Eliminar" de horario llama useDeleteServiceHour.mutate', () => {
    const { mutateDeleteHour } = setupDefaultMocks({ hours: SAMPLE_HOURS })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const deleteButtons = screen.getAllByRole('button', { name: /Eliminar horario/ })
    fireEvent.click(deleteButtons[0])

    expect(mutateDeleteHour).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'svc-1', hourId: 'hour-1' }),
      expect.objectContaining({ onSettled: expect.any(Function) })
    )
  })

  it('muestra lista de excepciones con fecha y motivo', () => {
    setupDefaultMocks({ exceptions: SAMPLE_EXCEPTIONS })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    expect(screen.getByText('2026-12-25')).toBeInTheDocument()
    expect(screen.getByText('Navidad')).toBeInTheDocument()
  })

  it('formulario de excepción llama useCreateServiceException.mutate al submit', async () => {
    const { mutateException } = setupDefaultMocks({ exceptions: [] })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const dateInput = screen.getByLabelText('Fecha')
    fireEvent.change(dateInput, { target: { value: '2026-12-25' } })

    const submitBtn = screen.getByRole('button', { name: 'Agregar excepción' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mutateException).toHaveBeenCalled()
    })
  })

  it('botón "Eliminar" de excepción llama useDeleteServiceException.mutate', () => {
    const { mutateDeleteException } = setupDefaultMocks({ exceptions: SAMPLE_EXCEPTIONS })
    render(<ServiceHoursView serviceId="svc-1" serviceName="Cardiología" />)

    const deleteBtn = screen.getByRole('button', { name: /Eliminar excepción 2026-12-25/ })
    fireEvent.click(deleteBtn)

    expect(mutateDeleteException).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'svc-1', exceptionId: 'exc-1' })
    )
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks de hooks ────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-professional-schedules', () => ({
  useProfessionalSchedules: vi.fn(),
}))
vi.mock('@/hooks/use-create-professional-schedule', () => ({
  useCreateProfessionalSchedule: vi.fn(),
}))
vi.mock('@/hooks/use-delete-professional-schedule', () => ({
  useDeleteProfessionalSchedule: vi.fn(),
}))

import { ProfessionalScheduleView } from './ProfessionalScheduleView'
import { useProfessionalSchedules } from '@/hooks/use-professional-schedules'
import { useCreateProfessionalSchedule } from '@/hooks/use-create-professional-schedule'
import { useDeleteProfessionalSchedule } from '@/hooks/use-delete-professional-schedule'
import type { ProfessionalSchedule } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_SCHEDULES: ProfessionalSchedule[] = [
  {
    schedule_id: 'sched-uuid-1',
    professional_id: 'prof-1',
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '18:00:00',
  },
  {
    schedule_id: 'sched-uuid-2',
    professional_id: 'prof-1',
    day_of_week: 2,
    start_time: '10:00:00',
    end_time: '17:00:00',
  },
]

function setupDefaultMocks({
  schedules = [] as ProfessionalSchedule[],
  isPending = false,
  isError = false,
} = {}) {
  const mutateFn = vi.fn()
  const mutateDelete = vi.fn()

  vi.mocked(useProfessionalSchedules).mockReturnValue({
    schedules,
    isPending,
    isError,
    refetch: vi.fn(),
  })
  vi.mocked(useCreateProfessionalSchedule).mockReturnValue({
    mutate: mutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateProfessionalSchedule>)
  vi.mocked(useDeleteProfessionalSchedule).mockReturnValue({
    mutate: mutateDelete,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteProfessionalSchedule>)

  return { mutateFn, mutateDelete }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfessionalScheduleView', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra skeleton mientras isPending es true', () => {
    setupDefaultMocks({ isPending: true })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const skeleton = screen.getByRole('status', { name: /Cargando horarios del profesional/i })
    expect(skeleton).toBeInTheDocument()
    expect(skeleton.className).toContain('animate-pulse')
  })

  it('muestra error state si isError es true con botón Reintentar', () => {
    setupDefaultMocks({ isError: true })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText('Reintentar')).toBeInTheDocument()
  })

  it('muestra lista de horarios con día y horas', () => {
    setupDefaultMocks({ schedules: SAMPLE_SCHEDULES })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    // 0=Lunes, 2=Miércoles (notación ISO)
    expect(screen.getAllByText('Lunes').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Miércoles').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('09:00 – 18:00')).toBeInTheDocument()
    expect(screen.getByText('10:00 – 17:00')).toBeInTheDocument()
  })

  it('muestra "No hay horarios configurados para este profesional" si lista vacía', () => {
    setupDefaultMocks({ schedules: [] })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    expect(screen.getByText('No hay horarios configurados para este profesional')).toBeInTheDocument()
  })

  it('formulario llama useCreateProfessionalSchedule.mutate al enviar', async () => {
    const { mutateFn } = setupDefaultMocks({ schedules: [] })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const startInput = screen.getByLabelText('Hora inicio')
    const endInput = screen.getByLabelText('Hora fin')
    fireEvent.change(startInput, { target: { value: '09:00' } })
    fireEvent.change(endInput, { target: { value: '18:00' } })

    const submitBtn = screen.getByRole('button', { name: 'Agregar horario' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalled()
    })
  })

  it('botón Eliminar llama useDeleteProfessionalSchedule.mutate', () => {
    const { mutateDelete } = setupDefaultMocks({ schedules: SAMPLE_SCHEDULES })
    render(<ProfessionalScheduleView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const deleteButtons = screen.getAllByRole('button', { name: /Eliminar horario/i })
    fireEvent.click(deleteButtons[0])

    expect(mutateDelete).toHaveBeenCalledWith(
      expect.objectContaining({ professionalId: 'prof-1', scheduleId: 'sched-uuid-1' }),
      expect.anything()
    )
  })
})

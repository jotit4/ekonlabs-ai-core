import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks de hooks ────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-blocked-times', () => ({
  useBlockedTimes: vi.fn(),
}))
vi.mock('@/hooks/use-create-blocked-time', () => ({
  useCreateBlockedTime: vi.fn(),
}))
vi.mock('@/hooks/use-delete-blocked-time', () => ({
  useDeleteBlockedTime: vi.fn(),
}))

import { BlockedTimesView } from './BlockedTimesView'
import { useBlockedTimes } from '@/hooks/use-blocked-times'
import { useCreateBlockedTime } from '@/hooks/use-create-blocked-time'
import { useDeleteBlockedTime } from '@/hooks/use-delete-blocked-time'
import type { BlockedTime } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_BLOCKED: BlockedTime[] = [
  {
    block_id: 'block-uuid-1',
    professional_id: 'prof-1',
    date_from: '2026-07-01',
    date_to: '2026-07-14',
    reason: 'Vacaciones',
  },
]

function setupDefaultMocks({
  blockedTimes = [] as BlockedTime[],
  isPending = false,
  isError = false,
} = {}) {
  const mutateFn = vi.fn()
  const mutateDelete = vi.fn()

  vi.mocked(useBlockedTimes).mockReturnValue({
    blockedTimes,
    isPending,
    isError,
    refetch: vi.fn(),
  })
  vi.mocked(useCreateBlockedTime).mockReturnValue({
    mutate: mutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateBlockedTime>)
  vi.mocked(useDeleteBlockedTime).mockReturnValue({
    mutate: mutateDelete,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteBlockedTime>)

  return { mutateFn, mutateDelete }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BlockedTimesView', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra skeleton mientras isPending es true', () => {
    setupDefaultMocks({ isPending: true })
    render(<BlockedTimesView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const skeleton = screen.getByRole('status', { name: /Cargando bloqueos del profesional/i })
    expect(skeleton).toBeInTheDocument()
    expect(skeleton.className).toContain('animate-pulse')
  })

  it('muestra lista de bloqueos con fechas y motivo', () => {
    setupDefaultMocks({ blockedTimes: SAMPLE_BLOCKED })
    render(<BlockedTimesView professionalId="prof-1" professionalName="Patricia Pérez" />)

    expect(screen.getByText('2026-07-01 – 2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('Vacaciones')).toBeInTheDocument()
  })

  it('muestra "No hay períodos bloqueados" si lista vacía', () => {
    setupDefaultMocks({ blockedTimes: [] })
    render(<BlockedTimesView professionalId="prof-1" professionalName="Patricia Pérez" />)

    expect(screen.getByText('No hay períodos bloqueados')).toBeInTheDocument()
  })

  it('formulario llama useCreateBlockedTime.mutate al enviar', async () => {
    const { mutateFn } = setupDefaultMocks({ blockedTimes: [] })
    render(<BlockedTimesView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const dateFromInput = screen.getByLabelText('Fecha desde')
    const dateToInput = screen.getByLabelText('Fecha hasta')
    fireEvent.change(dateFromInput, { target: { value: '2026-07-01' } })
    fireEvent.change(dateToInput, { target: { value: '2026-07-14' } })

    const submitBtn = screen.getByRole('button', { name: 'Registrar bloqueo' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalled()
    })
  })

  it('botón Eliminar llama useDeleteBlockedTime.mutate', () => {
    const { mutateDelete } = setupDefaultMocks({ blockedTimes: SAMPLE_BLOCKED })
    render(<BlockedTimesView professionalId="prof-1" professionalName="Patricia Pérez" />)

    const deleteBtn = screen.getByRole('button', { name: /Eliminar bloqueo 2026-07-01/i })
    fireEvent.click(deleteBtn)

    expect(mutateDelete).toHaveBeenCalledWith(
      expect.objectContaining({ professionalId: 'prof-1', blockId: 'block-uuid-1' })
    )
  })
})

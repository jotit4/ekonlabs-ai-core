import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AvailabilityShift } from '@/types/availability'
import { AvailabilitySlotPicker, type SelectedSlot } from './AvailabilitySlotPicker'

// Mock del hook de disponibilidad: el picker es controlado y solo pinta los huecos.
vi.mock('@/hooks/use-availability', () => ({
  useAvailability: vi.fn(),
}))
import { useAvailability } from '@/hooks/use-availability'

const PROF = 'prof-1'
const SERVICE = 'svc-1'

function makeShift(open: string, startIso: string): AvailabilityShift {
  return {
    open,
    close: '12:00',
    slot_start_iso: startIso,
    slot_end_iso: startIso.replace('T13', 'T14'),
    service_id: SERVICE,
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: PROF,
    professional_name: 'Patricia Pérez',
  }
}

function mockAvailability(shifts: AvailabilityShift[], opts: { isLoading?: boolean; isError?: boolean } = {}) {
  vi.mocked(useAvailability).mockReturnValue({
    daysShifts: {},
    daysSummary: {},
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    refetch: vi.fn(),
    shiftsForDate: () => shifts,
  })
}

describe('AvailabilitySlotPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAvailability([])
  })

  it('no consulta disponibilidad hasta elegir una fecha (enabled=false)', () => {
    render(
      <AvailabilitySlotPicker serviceId={SERVICE} professionalId={PROF} selected={[]} onToggle={vi.fn()} />,
    )
    // Sin fecha, el hook se invoca con enabled=false.
    expect(vi.mocked(useAvailability)).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, serviceId: SERVICE, professionalId: PROF }),
    )
  })

  it('al elegir fecha muestra los horarios libres como botones', async () => {
    mockAvailability([
      makeShift('10:00', '2026-06-15T13:00:00.000Z'),
      makeShift('11:00', '2026-06-15T14:00:00.000Z'),
    ])
    const user = userEvent.setup()
    render(
      <AvailabilitySlotPicker serviceId={SERVICE} professionalId={PROF} selected={[]} onToggle={vi.fn()} />,
    )

    await user.type(screen.getByLabelText('Fecha'), '2026-06-15')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '10:00' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '11:00' })).toBeInTheDocument()
    })
  })

  it('al clickear un horario emite onToggle con el slot { start_at, end_at, label }', async () => {
    mockAvailability([makeShift('10:00', '2026-06-15T13:00:00.000Z')])
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <AvailabilitySlotPicker serviceId={SERVICE} professionalId={PROF} selected={[]} onToggle={onToggle} />,
    )

    await user.type(screen.getByLabelText('Fecha'), '2026-06-15')
    await user.click(await screen.findByRole('button', { name: '10:00' }))

    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        start_at: '2026-06-15T13:00:00.000Z',
        end_at: '2026-06-15T14:00:00.000Z',
        label: '10:00',
        date: '2026-06-15',
      }),
    )
  })

  it('marca como seleccionado (aria-pressed) el horario que está en `selected`', async () => {
    mockAvailability([makeShift('10:00', '2026-06-15T13:00:00.000Z')])
    const selected: SelectedSlot[] = [
      { start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z', date: '2026-06-15', label: '10:00' },
    ]
    const user = userEvent.setup()
    render(
      <AvailabilitySlotPicker serviceId={SERVICE} professionalId={PROF} selected={selected} onToggle={vi.fn()} />,
    )
    await user.type(screen.getByLabelText('Fecha'), '2026-06-15')
    const btn = await screen.findByRole('button', { name: '10:00' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('muestra "no hay horarios libres" cuando la fecha no tiene huecos', async () => {
    mockAvailability([])
    const user = userEvent.setup()
    render(
      <AvailabilitySlotPicker serviceId={SERVICE} professionalId={PROF} selected={[]} onToggle={vi.fn()} />,
    )
    await user.type(screen.getByLabelText('Fecha'), '2026-06-15')
    await waitFor(() => {
      expect(screen.getByText(/no hay horarios libres/i)).toBeInTheDocument()
    })
  })
})

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useState } from 'react'
import { MultiSessionScheduler } from './MultiSessionScheduler'
import type { SelectedSlot } from './AvailabilitySlotPicker'
import type { AvailabilityShift } from '@/types/availability'

// El motor usa AvailabilitySlotPicker → useAvailability (RPC real). Lo mockeamos
// para devolver huecos deterministas: dos por fecha (12:00 y 13:00), con
// slot_start_iso ÚNICO por fecha+hora, de modo que huecos de días distintos no
// colisionen en la selección (dedup por start_at).
vi.mock('@/hooks/use-availability', () => ({ useAvailability: vi.fn(), fetchAvailabilityDays: vi.fn() }))
import { useAvailability, fetchAvailabilityDays } from '@/hooks/use-availability'

function shiftFor(date: string, hhmm: string, prof = 'prof-1'): AvailabilityShift {
  const hour = hhmm.slice(0, 2)
  return {
    open: hhmm,
    close: hhmm,
    slot_start_iso: `${date}T${hour}:00:00.000Z`,
    slot_end_iso: `${date}T${hour}:59:00.000Z`,
    service_id: 'svc-1',
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: prof,
    professional_name: 'Patricia Pérez',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAvailabilityDays).mockResolvedValue({ days: {} })
  vi.mocked(useAvailability).mockImplementation(({ enabled }) => ({
    daysShifts: {},
    daysSummary: {},
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    shiftsForDate: (d: string) => (enabled && d ? [shiftFor(d, '12:00'), shiftFor(d, '13:00')] : []),
  }))
})

// Wrapper: el motor es controlado por el padre (selected + onChange).
function Harness({ total, professionalId = 'prof-1' }: { total: number; professionalId?: string | null }) {
  const [selected, setSelected] = useState<SelectedSlot[]>([])
  return (
    <MultiSessionScheduler
      serviceId="svc-1"
      professionalId={professionalId}
      total={total}
      selected={selected}
      onChange={setSelected}
    />
  )
}

async function pickDate(date: string) {
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } })
  await waitFor(() => expect(screen.getByRole('button', { name: '12:00' })).toBeInTheDocument())
}

describe('MultiSessionScheduler', () => {
  it('muestra el contador 0/N y la cadencia', () => {
    render(<Harness total={5} />)
    expect(screen.getByText(/Eleg[ií] 5 horarios/)).toBeInTheDocument()
    expect(screen.getByLabelText('Vas 0 de 5')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Cadencia' })).toBeInTheDocument()
  })

  it('al elegir un hueco lo suma a la lista y avanza el contador', async () => {
    const user = userEvent.setup()
    render(<Harness total={5} />)

    await pickDate('2026-07-07')
    await user.click(screen.getByRole('button', { name: '12:00' }))

    expect(screen.getByLabelText('Vas 1 de 5')).toBeInTheDocument()
    expect(screen.getByText(/Sesiones elegidas \(1\/5\)/)).toBeInTheDocument()
  })

  it('no deja elegir más horarios que el total', async () => {
    const user = userEvent.setup()
    render(<Harness total={1} />)

    await pickDate('2026-07-07')
    await user.click(screen.getByRole('button', { name: '12:00' }))
    // Con total=1 no hay auto-avance (ya está completo); el segundo hueco del mismo
    // día se ignora por el tope.
    await user.click(screen.getByRole('button', { name: '13:00' }))

    expect(screen.getByLabelText('Vas 1 de 1')).toBeInTheDocument()
    expect(screen.getByText(/Completaste las 1/)).toBeInTheDocument()
  })

  it('permite quitar una sesión elegida', async () => {
    const user = userEvent.setup()
    render(<Harness total={3} />)

    await pickDate('2026-07-07')
    await user.click(screen.getByRole('button', { name: '12:00' }))
    expect(screen.getByLabelText('Vas 1 de 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Quitar martes.*09:00/i }))
    expect(screen.getByLabelText('Vas 0 de 3')).toBeInTheDocument()
    expect(screen.queryByText(/Sesiones elegidas/)).not.toBeInTheDocument()
  })

  it('ofrece la cadencia "Todos los días"', () => {
    render(<Harness total={5} />)
    expect(screen.getByRole('button', { name: 'Todos los días' })).toBeInTheDocument()
  })

  describe('Proponer automáticamente (Pedido B — bonos x5/x10 en días consecutivos)', () => {
    it('no muestra botón "Proponer" ni texto "Proponiendo"', () => {
      render(<Harness total={5} />)
      expect(screen.queryByRole('button', { name: /Proponer/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/Proponiendo/i)).not.toBeInTheDocument()
    })

    it('tras elegir el primer horario, propone el resto y los agrega a la selección', async () => {
      vi.mocked(fetchAvailabilityDays).mockResolvedValue({
        days: {
          '2026-07-08': { available: true, shifts: [shiftFor('2026-07-08', '12:00')] },
          '2026-07-09': { available: true, shifts: [shiftFor('2026-07-09', '12:00')] },
          '2026-07-10': { available: true, shifts: [shiftFor('2026-07-10', '12:00')] },
          '2026-07-13': { available: true, shifts: [shiftFor('2026-07-13', '12:00')] },
        },
      })
      const user = userEvent.setup()
      render(<Harness total={5} />)

      await pickDate('2026-07-07')
      await user.click(screen.getByRole('button', { name: '12:00' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Vas 5 de 5')).toBeInTheDocument()
      })
      expect(fetchAvailabilityDays).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: '2026-07-08',
          dateTo: '2026-07-13',
          serviceId: 'svc-1',
          professionalId: 'prof-1',
          allProfessionals: false,
        }),
      )
    })

    it('marca como pendiente el día sin hueco a la hora del ancla (no inventa horario)', async () => {
      vi.mocked(fetchAvailabilityDays).mockResolvedValue({
        days: {
          '2026-07-08': { available: false, shifts: [] },
        },
      })
      const user = userEvent.setup()
      render(<Harness total={2} />)

      await pickDate('2026-07-07')
      await user.click(screen.getByRole('button', { name: '12:00' }))

      await waitFor(() => {
        expect(screen.getByText(/Sin horario libre ese día/i)).toBeInTheDocument()
      })
      // No sumó una 2da sesión (no había hueco a esa hora) — sigue en 1/2.
      expect(screen.getByLabelText('Vas 1 de 2')).toBeInTheDocument()
    })

    it('en modo "cualquier profesional" pide allProfessionals=true', async () => {
      vi.mocked(fetchAvailabilityDays).mockResolvedValue({ days: {} })
      const user = userEvent.setup()
      render(<Harness total={2} professionalId={null} />)

      fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-07' } })
      await user.click(await screen.findByRole('button', { name: '12:00' }))

      await waitFor(() => {
        expect(fetchAvailabilityDays).toHaveBeenCalledWith(
          expect.objectContaining({ professionalId: undefined, allProfessionals: true }),
        )
      })
    })

    it('la propuesta automática sigue siendo editable antes de confirmar', async () => {
      vi.mocked(fetchAvailabilityDays).mockResolvedValue({
        days: {
          '2026-07-08': { available: true, shifts: [shiftFor('2026-07-08', '12:00')] },
        },
      })
      const user = userEvent.setup()
      render(<Harness total={2} />)

      await pickDate('2026-07-07')
      await user.click(screen.getByRole('button', { name: '12:00' }))
      await waitFor(() => expect(screen.getByLabelText('Vas 2 de 2')).toBeInTheDocument())

      const removeButtons = screen.getAllByRole('button', { name: /Quitar/i })
      await user.click(removeButtons[1])
      expect(screen.getByLabelText('Vas 1 de 2')).toBeInTheDocument()
    })

    it('si falla la propuesta conserva el ancla y permite completar manualmente', async () => {
      vi.mocked(fetchAvailabilityDays).mockRejectedValue(new Error('network'))
      const user = userEvent.setup()
      render(<Harness total={2} />)

      await pickDate('2026-07-07')
      await user.click(screen.getByRole('button', { name: '12:00' }))

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/manualmente/i))
      expect(screen.getByLabelText('Vas 1 de 2')).toBeInTheDocument()
    })

    it('divide en rangos válidos una propuesta de cadencia larga', async () => {
      vi.mocked(fetchAvailabilityDays).mockResolvedValue({ days: {} })
      const user = userEvent.setup()
      render(<Harness total={12} />)

      await user.click(screen.getByRole('button', { name: '1 vez/sem' }))
      await pickDate('2026-07-07')
      await user.click(screen.getByRole('button', { name: '12:00' }))

      await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalledTimes(2))
      expect(fetchAvailabilityDays).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ dateFrom: '2026-07-14', dateTo: '2026-09-08' }),
      )
      expect(fetchAvailabilityDays).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ dateFrom: '2026-09-15', dateTo: '2026-09-22' }),
      )
    })
  })
})

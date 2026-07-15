import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DayStatusModal } from './DayStatusModal'
import type { DayStatusEntry } from '@/types/holidays'

function makeEntry(overrides: Partial<DayStatusEntry> = {}): DayStatusEntry {
  return {
    date: '2026-12-25',
    isHoliday: true,
    holidayName: 'Navidad',
    decisionIsOpen: null,
    decidedByName: null,
    decidedAt: null,
    reason: null,
    effectiveOpen: false,
    ...overrides,
  }
}

describe('DayStatusModal', () => {
  it('open=false → no renderiza nada', () => {
    render(
      <DayStatusModal open={false} date="2026-12-25" entry={undefined} onClose={vi.fn()} onDecide={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('date=null → no renderiza nada', () => {
    render(<DayStatusModal open={true} date={null} entry={undefined} onClose={vi.fn()} onDecide={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra la pregunta y el nombre del feriado', () => {
    render(
      <DayStatusModal
        open={true}
        date="2026-12-25"
        entry={makeEntry()}
        onClose={vi.fn()}
        onDecide={vi.fn()}
      />,
    )
    expect(screen.getByText('¿Este día está abierto o no?')).toBeInTheDocument()
    expect(screen.getByText(/Feriado nacional: Navidad/)).toBeInTheDocument()
  })

  it('día normal (sin feriado) → NO muestra el rótulo de feriado', () => {
    render(
      <DayStatusModal
        open={true}
        date="2026-12-15"
        entry={undefined}
        onClose={vi.fn()}
        onDecide={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Feriado nacional/)).not.toBeInTheDocument()
  })

  it('click en "Sí, abrimos" llama onDecide(true, undefined) sin motivo', async () => {
    const user = userEvent.setup()
    const onDecide = vi.fn()
    render(
      <DayStatusModal open={true} date="2026-12-25" entry={makeEntry()} onClose={vi.fn()} onDecide={onDecide} />,
    )
    await user.click(screen.getByRole('button', { name: 'Sí, abrimos' }))
    expect(onDecide).toHaveBeenCalledWith(true, undefined)
  })

  it('click en "No, cerrado" llama onDecide(false, undefined)', async () => {
    const user = userEvent.setup()
    const onDecide = vi.fn()
    render(
      <DayStatusModal open={true} date="2026-12-25" entry={makeEntry()} onClose={vi.fn()} onDecide={onDecide} />,
    )
    await user.click(screen.getByRole('button', { name: 'No, cerrado' }))
    expect(onDecide).toHaveBeenCalledWith(false, undefined)
  })

  it('escribe un motivo y lo envía junto con la decisión', async () => {
    const user = userEvent.setup()
    const onDecide = vi.fn()
    render(
      <DayStatusModal
        open={true}
        date="2026-12-15"
        entry={undefined}
        onClose={vi.fn()}
        onDecide={onDecide}
      />,
    )
    await user.type(screen.getByLabelText('Motivo (opcional)'), 'Corte de agua')
    await user.click(screen.getByRole('button', { name: 'No, cerrado' }))
    expect(onDecide).toHaveBeenCalledWith(false, 'Corte de agua')
  })

  it('muestra la confirmación "Decidido por X" cuando ya hay una decisión', () => {
    render(
      <DayStatusModal
        open={true}
        date="2026-12-25"
        entry={makeEntry({ decisionIsOpen: true, decidedByName: 'Ana Recepción', decidedAt: '2026-12-01T10:00:00.000Z', effectiveOpen: true })}
        onClose={vi.fn()}
        onDecide={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Ana Recepción')
    expect(screen.getByRole('status')).toHaveTextContent('Abre')
  })

  it('sin decisión previa → NO muestra el bloque de confirmación', () => {
    render(
      <DayStatusModal open={true} date="2026-12-25" entry={makeEntry({ decisionIsOpen: null })} onClose={vi.fn()} onDecide={vi.fn()} />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('botones deshabilitados cuando isSaving=true', () => {
    render(
      <DayStatusModal
        open={true}
        date="2026-12-25"
        entry={makeEntry()}
        onClose={vi.fn()}
        onDecide={vi.fn()}
        isSaving
      />,
    )
    expect(screen.getByRole('button', { name: 'Sí, abrimos' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'No, cerrado' })).toBeDisabled()
  })

  it('click en "Cerrar" llama onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <DayStatusModal open={true} date="2026-12-25" entry={makeEntry()} onClose={onClose} onDecide={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

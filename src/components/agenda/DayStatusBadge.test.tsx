import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DayStatusBadge } from './DayStatusBadge'
import type { DayStatusEntry } from '@/types/holidays'

function makeEntry(overrides: Partial<DayStatusEntry> = {}): DayStatusEntry {
  return {
    date: '2026-12-25',
    isHoliday: false,
    holidayName: null,
    decisionIsOpen: null,
    decidedByName: null,
    decidedAt: null,
    reason: null,
    effectiveOpen: true,
    ...overrides,
  }
}

describe('DayStatusBadge', () => {
  it('entry undefined (día normal) → botón sutil "⋯", igual clickeable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<DayStatusBadge entry={undefined} onClick={onClick} />)

    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('⋯')
    await user.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('feriado sin decisión → pastilla roja "Cerrado" con el nombre del feriado', () => {
    render(
      <DayStatusBadge
        entry={makeEntry({ isHoliday: true, holidayName: 'Navidad', decisionIsOpen: null, effectiveOpen: false })}
        onClick={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('Navidad')
    expect(btn.getAttribute('aria-label')).toMatch(/feriado nacional/i)
  })

  it('feriado con decisión "abre" → pastilla ámbar, menciona "abre"', () => {
    render(
      <DayStatusBadge
        entry={makeEntry({ isHoliday: true, holidayName: 'Día del Trabajador', decisionIsOpen: true, effectiveOpen: true })}
        onClick={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent(/abre/i)
  })

  it('día normal cerrado a mano → pastilla roja "Cerrado" sin nombre de feriado', () => {
    render(
      <DayStatusBadge
        entry={makeEntry({ isHoliday: false, holidayName: null, decisionIsOpen: false, effectiveOpen: false })}
        onClick={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('Cerrado')
  })

  it('click en la pastilla llama onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DayStatusBadge
        entry={makeEntry({ isHoliday: true, holidayName: 'Navidad', decisionIsOpen: null, effectiveOpen: false })}
        onClick={onClick}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('compact=true reduce el tamaño de fuente (vista Mes)', () => {
    render(
      <DayStatusBadge
        entry={makeEntry({ isHoliday: true, holidayName: 'Navidad', decisionIsOpen: null, effectiveOpen: false })}
        onClick={vi.fn()}
        compact
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn.style.fontSize).toBe('10px')
  })
})

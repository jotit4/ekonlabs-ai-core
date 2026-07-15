import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { makeMonthDateHeader, makeMonthDayPropGetter } from './MonthDayStatusHeader'
import type { DayStatusEntry } from '@/types/holidays'

const HOLIDAY_CLOSED: DayStatusEntry = {
  date: '2026-12-25',
  isHoliday: true,
  holidayName: 'Navidad',
  decisionIsOpen: null,
  decidedByName: null,
  decidedAt: null,
  reason: null,
  effectiveOpen: false,
}

describe('makeMonthDateHeader', () => {
  it('sin entry para la fecha → renderiza el label sin badge de estado', () => {
    const DateHeader = makeMonthDateHeader({}, vi.fn())
    render(<DateHeader label="15" date={new Date('2026-12-15T00:00:00')} drilldownView="day" onDrillDown={vi.fn()} />)
    expect(screen.getByText('15')).toBeInTheDocument()
    // Botón sutil "⋯" (día normal) — sigue habiendo un trigger, solo que discreto.
    expect(screen.getByRole('button', { name: 'Día abierto. Click para cambiar el estado de este día.' })).toBeDefined()
  })

  it('con entry feriado cerrado → renderiza el badge de estado y el label', () => {
    const DateHeader = makeMonthDateHeader({ '2026-12-25': HOLIDAY_CLOSED }, vi.fn())
    render(<DateHeader label="25" date={new Date('2026-12-25T00:00:00')} drilldownView="day" onDrillDown={vi.fn()} />)
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText(/Navidad/)).toBeInTheDocument()
  })

  it('drilldownView presente → el label es un botón que llama onDrillDown', async () => {
    const user = userEvent.setup()
    const onDrillDown = vi.fn()
    const DateHeader = makeMonthDateHeader({}, vi.fn())
    render(<DateHeader label="15" date={new Date('2026-12-15T00:00:00')} drilldownView="day" onDrillDown={onDrillDown} />)
    await user.click(screen.getByText('15'))
    expect(onDrillDown).toHaveBeenCalledOnce()
  })

  it('sin drilldownView → el label es texto plano (no botón)', () => {
    const DateHeader = makeMonthDateHeader({}, vi.fn())
    render(<DateHeader label="15" date={new Date('2026-12-15T00:00:00')} drilldownView={null} onDrillDown={vi.fn()} />)
    const label = screen.getByText('15')
    expect(label.tagName).not.toBe('BUTTON')
  })

  it('click en el badge llama onDayStatusClick con la fecha ISO', async () => {
    const user = userEvent.setup()
    const onDayStatusClick = vi.fn()
    const DateHeader = makeMonthDateHeader({ '2026-12-25': HOLIDAY_CLOSED }, onDayStatusClick)
    render(<DateHeader label="25" date={new Date('2026-12-25T00:00:00')} drilldownView="day" onDrillDown={vi.fn()} />)
    await user.click(screen.getByText(/Navidad/))
    expect(onDayStatusClick).toHaveBeenCalledWith('2026-12-25')
  })
})

describe('makeMonthDayPropGetter', () => {
  it('dayStatusMap undefined → siempre {} (sin cambio visual)', () => {
    const getter = makeMonthDayPropGetter(undefined)
    expect(getter(new Date('2026-12-25T00:00:00'))).toEqual({})
  })

  it('fecha sin entry → {} (día normal)', () => {
    const getter = makeMonthDayPropGetter({})
    expect(getter(new Date('2026-12-15T00:00:00'))).toEqual({})
  })

  it('día cerrado → devuelve estilo con background (rayado)', () => {
    const getter = makeMonthDayPropGetter({ '2026-12-25': HOLIDAY_CLOSED })
    const result = getter(new Date('2026-12-25T00:00:00'))
    expect(result.style?.background).toContain('repeating-linear-gradient')
  })

  it('día "especial" pero efectivamente abierto → tinte distinto (sin rayado)', () => {
    const openEntry: DayStatusEntry = { ...HOLIDAY_CLOSED, decisionIsOpen: true, effectiveOpen: true }
    const getter = makeMonthDayPropGetter({ '2026-12-25': openEntry })
    const result = getter(new Date('2026-12-25T00:00:00'))
    expect(result.style?.background).not.toContain('repeating-linear-gradient')
    expect(result.style?.background).toBeTruthy()
  })
})

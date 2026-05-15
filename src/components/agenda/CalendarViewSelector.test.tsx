import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CalendarViewSelector } from './CalendarViewSelector'

describe('CalendarViewSelector', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza tres botones: "Mes", "Semana" y "Día"', () => {
    render(<CalendarViewSelector activeView="dia" onChange={mockOnChange} />)
    expect(screen.getByRole('button', { name: 'Mes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Día' })).toBeInTheDocument()
  })

  it('el botón activo tiene aria-pressed="true" cuando activeView="dia"', () => {
    render(<CalendarViewSelector activeView="dia" onChange={mockOnChange} />)
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('el botón activo tiene aria-pressed="true" cuando activeView="semana"', () => {
    render(<CalendarViewSelector activeView="semana" onChange={mockOnChange} />)
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('al hacer click en "Semana", llama onChange("semana")', async () => {
    const user = userEvent.setup()
    render(<CalendarViewSelector activeView="dia" onChange={mockOnChange} />)
    await user.click(screen.getByRole('button', { name: 'Semana' }))
    expect(mockOnChange).toHaveBeenCalledWith('semana')
  })

  it('al hacer click en "Mes", llama onChange("mes")', async () => {
    const user = userEvent.setup()
    render(<CalendarViewSelector activeView="dia" onChange={mockOnChange} />)
    await user.click(screen.getByRole('button', { name: 'Mes' }))
    expect(mockOnChange).toHaveBeenCalledWith('mes')
  })

  it('al hacer click en "Día", llama onChange("dia")', async () => {
    const user = userEvent.setup()
    render(<CalendarViewSelector activeView="semana" onChange={mockOnChange} />)
    await user.click(screen.getByRole('button', { name: 'Día' }))
    expect(mockOnChange).toHaveBeenCalledWith('dia')
  })
})

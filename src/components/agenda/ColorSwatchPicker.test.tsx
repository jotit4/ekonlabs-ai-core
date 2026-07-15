import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { TURNERO_PALETTE } from '@/lib/agenda/turnero-palette'

describe('ColorSwatchPicker', () => {
  it('renderiza los 16 colores de la paleta + "Sin color"', () => {
    render(<ColorSwatchPicker value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sin color' })).toBeInTheDocument()
    for (const color of TURNERO_PALETTE) {
      expect(screen.getByRole('button', { name: `Color ${color}` })).toBeInTheDocument()
    }
  })

  it('marca "Sin color" como presionado cuando value=null', () => {
    render(<ColorSwatchPicker value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sin color' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: `Color ${TURNERO_PALETTE[0]}` })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('marca el swatch correspondiente como presionado cuando value coincide', () => {
    render(<ColorSwatchPicker value={TURNERO_PALETTE[3]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: `Color ${TURNERO_PALETTE[3]}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Sin color' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('llama onChange(color) al clickear un swatch', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColorSwatchPicker value={null} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: `Color ${TURNERO_PALETTE[5]}` }))
    expect(onChange).toHaveBeenCalledWith(TURNERO_PALETTE[5])
  })

  it('llama onChange(null) al clickear "Sin color"', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColorSwatchPicker value={TURNERO_PALETTE[0]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Sin color' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('deshabilita todos los swatches cuando disabled=true', () => {
    render(<ColorSwatchPicker value={null} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Sin color' })).toBeDisabled()
    expect(screen.getByRole('button', { name: `Color ${TURNERO_PALETTE[0]}` })).toBeDisabled()
  })

  it('cada swatch mide al menos 44x44 (mínimo táctil)', () => {
    render(<ColorSwatchPicker value={null} onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: `Color ${TURNERO_PALETTE[0]}` })
    expect(button).toHaveStyle({ width: '44px', height: '44px' })
  })

  it('acepta un label custom para el grupo', () => {
    render(<ColorSwatchPicker value={null} onChange={vi.fn()} label="Color manual" />)
    expect(screen.getByRole('group', { name: 'Color manual' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DateField } from './date-field'

// Mockeamos el Popover (base-ui) para evitar floating-ui/portals en jsdom —
// mismo patrón usado en UserProfileButton.test.tsx. El contenido queda
// siempre presente en el DOM, así podemos interactuar con la grilla directo.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}))

describe('DateField', () => {
  it('muestra el valor ISO recibido formateado como dd/mm/aaaa', () => {
    render(
      <div>
        <label htmlFor="fecha-nac">Fecha de nacimiento</label>
        <DateField id="fecha-nac" value="1980-03-15" onChange={vi.fn()} />
      </div>
    )
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('15/03/1980')
  })

  it('con value vacío, el input queda vacío (sin fecha placeholder falsa)', () => {
    render(<DateField aria-label="Fecha" value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Fecha')).toHaveValue('')
  })

  it('escritura manual completa (8 dígitos) confirma en formato ISO yyyy-MM-dd', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField aria-label="Fecha" value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Fecha'), '15031980')

    expect(onChange).toHaveBeenCalledWith('1980-03-15')
  })

  it('permite tipear rápido una fecha lejana (ej. un cumpleaños de hace 45 años) sin usar el calendario', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField aria-label="Fecha" value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Fecha'), '01011950')

    expect(onChange).toHaveBeenCalledWith('1950-01-01')
  })

  it('fecha inválida (ej. 31/02) se revierte al último valor válido', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField aria-label="Fecha" value="2026-01-10" onChange={onChange} />)

    const input = screen.getByLabelText('Fecha')
    await user.clear(input)
    await user.type(input, '31022026')

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('10/01/2026')
  })

  it('el calendario muestra selects de mes y año en español (sin depender del locale del navegador)', () => {
    render(<DateField value="2026-07-14" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Mes' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Julio' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Año' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2026' })).toBeInTheDocument()
  })

  it('al hacer click en un día de la grilla, confirma esa fecha en formato ISO', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField value="2026-07-14" onChange={onChange} />)

    await user.click(screen.getByRole('gridcell', { name: '20' }))

    expect(onChange).toHaveBeenCalledWith('2026-07-20')
  })

  it('cambiar el select de mes navega el calendario sin tocar el valor seleccionado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField value="2026-07-14" onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), 'Agosto')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveValue('7') // Agosto = índice 7
  })

  it('respeta minDate/maxDate: un día fuera de rango queda deshabilitado', () => {
    render(
      <DateField
        value="2026-07-14"
        onChange={vi.fn()}
        minDate="2026-07-10"
        maxDate="2026-07-20"
      />
    )
    expect(screen.getByRole('gridcell', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('gridcell', { name: '25' })).toBeDisabled()
    expect(screen.getByRole('gridcell', { name: '15' })).not.toBeDisabled()
  })

  it('disabled deshabilita el input y el disparador del calendario', () => {
    render(<DateField aria-label="Fecha" value="2026-07-14" onChange={vi.fn()} disabled />)
    expect(screen.getByLabelText('Fecha')).toBeDisabled()
    expect(screen.getByRole('button', { name: /elegir fecha/i })).toBeDisabled()
  })
})

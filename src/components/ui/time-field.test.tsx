import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { TimeField } from './time-field'

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

describe('TimeField', () => {
  it('renderiza el input asociado a un label vía htmlFor/id', () => {
    render(
      <div>
        <label htmlFor="hora-inicio">Hora inicio</label>
        <TimeField id="hora-inicio" value="09:00" onChange={vi.fn()} />
      </div>
    )
    expect(screen.getByLabelText('Hora inicio')).toHaveValue('09:00')
  })

  it('nunca muestra am/pm en ningún texto renderizado', () => {
    const { container } = render(<TimeField value="14:30" onChange={vi.fn()} />)
    expect(container.textContent ?? '').not.toMatch(/am|pm/i)
  })

  it('la grilla rápida cubre 08:00–20:00 cada 30 minutos por defecto', () => {
    render(<TimeField value="" onChange={vi.fn()} />)
    expect(screen.getByRole('option', { name: '08:00' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '08:30' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '20:00' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '20:30' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '07:30' })).not.toBeInTheDocument()
  })

  it('al hacer click en un horario de la grilla, llama onChange con ese horario', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeField value="" onChange={onChange} />)

    await user.click(screen.getByRole('option', { name: '10:30' }))

    expect(onChange).toHaveBeenCalledWith('10:30')
  })

  it('escritura manual de 4 dígitos autoformatea y confirma la hora (HH:mm)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeField aria-label="Hora" value="" onChange={onChange} />)

    const input = screen.getByLabelText('Hora')
    await user.type(input, '0930')

    expect(input).toHaveValue('09:30')
    expect(onChange).toHaveBeenCalledWith('09:30')
  })

  it('hora inválida (fuera de 24h) se revierte al último valor válido', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeField aria-label="Hora" value="09:00" onChange={onChange} />)

    const input = screen.getByLabelText('Hora')
    await user.clear(input)
    await user.type(input, '2599')

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('09:00')
  })

  it('Enter dentro de un <form> confirma el valor y no dispara submit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={handleSubmit}>
        <TimeField aria-label="Hora" value="09:00" onChange={onChange} />
      </form>
    )

    await user.click(screen.getByLabelText('Hora'))
    await user.keyboard('{Enter}')

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('permite escribir una hora arbitraria fuera de la grilla rápida (ej. 08:07)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeField aria-label="Hora" value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Hora'), '0807')

    expect(onChange).toHaveBeenCalledWith('08:07')
  })

  it('respeta minTime/maxTime/stepMinutes personalizados', () => {
    render(<TimeField value="" onChange={vi.fn()} minTime="09:00" maxTime="10:00" stepMinutes={15} />)
    expect(screen.getByRole('option', { name: '09:00' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '09:15' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '10:00' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '08:45' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '10:15' })).not.toBeInTheDocument()
  })

  it('disabled deshabilita el input y el disparador del calendario de horarios', () => {
    render(<TimeField aria-label="Hora" value="09:00" onChange={vi.fn()} disabled />)
    expect(screen.getByLabelText('Hora')).toBeDisabled()
    expect(screen.getByRole('button', { name: /elegir un horario/i })).toBeDisabled()
  })
})

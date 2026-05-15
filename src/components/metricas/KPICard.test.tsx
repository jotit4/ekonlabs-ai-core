import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KPICard } from './KPICard'

describe('KPICard', () => {
  it('renderiza el título correctamente', () => {
    render(<KPICard titulo="Turnos del mes" valor={20} />)
    expect(screen.getByText('Turnos del mes')).toBeInTheDocument()
  })

  it('renderiza el valor numérico formateado', () => {
    render(<KPICard titulo="Turnos del mes" valor={1000} />)
    // Intl.NumberFormat es-AR formatea 1000 como "1.000" en algunos entornos
    // En entorno de test puede ser "1,000" — verificamos que el número esté presente
    const element = screen.getByText(/1[.,]000/)
    expect(element).toBeInTheDocument()
  })

  it('renderiza el valor string directamente (porcentaje)', () => {
    render(<KPICard titulo="Ocupación" valor="75%" />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('renderiza el subtítulo cuando se provee', () => {
    render(<KPICard titulo="Ocupación" valor="75%" subtitulo="15 de 20 turnos" />)
    expect(screen.getByText('15 de 20 turnos')).toBeInTheDocument()
  })

  it('NO renderiza subtítulo cuando no se provee', () => {
    render(<KPICard titulo="Turnos" valor={5} />)
    expect(screen.queryByText('15 de 20 turnos')).not.toBeInTheDocument()
  })

  it('muestra skeleton cuando isLoading es true', () => {
    render(<KPICard titulo="Turnos" valor={0} isLoading={true} />)
    const skeleton = screen.getByRole('status')
    expect(skeleton).toBeInTheDocument()
    expect(skeleton).toHaveAttribute('aria-label', 'Cargando métrica')
  })

  it('NO muestra skeleton cuando isLoading es false (default)', () => {
    render(<KPICard titulo="Turnos" valor={0} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renderiza valor cero correctamente sin ocultar la estructura', () => {
    render(<KPICard titulo="No-shows" valor={0} />)
    expect(screen.getByText('No-shows')).toBeInTheDocument()
    // El valor 0 debe estar presente
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})

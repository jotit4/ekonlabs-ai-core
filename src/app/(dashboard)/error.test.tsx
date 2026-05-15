import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import DashboardError from './error'

describe('DashboardError', () => {
  it('muestra mensaje de error branded', () => {
    const mockRetry = vi.fn()
    render(
      <DashboardError
        error={new Error('test error')}
        unstable_retry={mockRetry}
      />
    )
    expect(screen.getByText('Ocurrió un error inesperado')).toBeInTheDocument()
  })

  it('muestra botón Reintentar', () => {
    const mockRetry = vi.fn()
    render(
      <DashboardError
        error={new Error('test error')}
        unstable_retry={mockRetry}
      />
    )
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('llama unstable_retry al hacer click en Reintentar', () => {
    const mockRetry = vi.fn()
    render(
      <DashboardError
        error={new Error('test error')}
        unstable_retry={mockRetry}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(mockRetry).toHaveBeenCalledTimes(1)
  })

  it('muestra digest cuando está disponible', () => {
    const mockRetry = vi.fn()
    const errorWithDigest = Object.assign(new Error('test'), { digest: 'abc123' })
    render(
      <DashboardError
        error={errorWithDigest}
        unstable_retry={mockRetry}
      />
    )
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
  })

  it('no muestra código de referencia cuando no hay digest', () => {
    const mockRetry = vi.fn()
    render(
      <DashboardError
        error={new Error('test error')}
        unstable_retry={mockRetry}
      />
    )
    expect(screen.queryByText(/Código de referencia/)).not.toBeInTheDocument()
  })
})

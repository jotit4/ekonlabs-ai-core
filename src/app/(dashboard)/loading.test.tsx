import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DashboardLoading from './loading'

describe('DashboardLoading', () => {
  it('renderiza con role="status"', () => {
    render(<DashboardLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('tiene aria-label accesible', () => {
    render(<DashboardLoading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando...')
  })
})

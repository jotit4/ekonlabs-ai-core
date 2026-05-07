import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusDot, statusToVariant } from './StatusDot'
import type { AppointmentStatus } from '@/types/appointments'

describe('StatusDot', () => {
  it('renderiza con variante active y aria-label correcto', () => {
    render(<StatusDot variant="active" label="Confirmado" />)
    expect(screen.getByRole('img', { name: 'Estado: Confirmado' })).toBeInTheDocument()
  })

  it('renderiza con variante warning', () => {
    render(<StatusDot variant="warning" label="Pendiente" />)
    expect(screen.getByRole('img', { name: 'Estado: Pendiente' })).toBeInTheDocument()
  })

  it('renderiza con variante alert', () => {
    render(<StatusDot variant="alert" label="No-show" />)
    expect(screen.getByRole('img', { name: 'Estado: No-show' })).toBeInTheDocument()
  })

  it('renderiza con variante inactive', () => {
    render(<StatusDot variant="inactive" label="Cancelado" />)
    expect(screen.getByRole('img', { name: 'Estado: Cancelado' })).toBeInTheDocument()
  })

  it('renderiza con variante human', () => {
    render(<StatusDot variant="human" label="Agente humano" />)
    expect(screen.getByRole('img', { name: 'Estado: Agente humano' })).toBeInTheDocument()
  })

  it('tiene tamaño 9px', () => {
    render(<StatusDot variant="active" label="Confirmado" />)
    const dot = screen.getByRole('img', { name: 'Estado: Confirmado' })
    expect(dot).toHaveStyle({ width: '9px', height: '9px', borderRadius: '50%' })
  })
})

describe('statusToVariant', () => {
  const cases: [AppointmentStatus, ReturnType<typeof statusToVariant>][] = [
    ['confirmed', 'active'],
    ['pending', 'warning'],
    ['rescheduled', 'warning'],
    ['cancelled', 'inactive'],
    ['no_show', 'alert'],
  ]

  it.each(cases)('%s → %s', (status, expected) => {
    expect(statusToVariant(status)).toBe(expected)
  })
})

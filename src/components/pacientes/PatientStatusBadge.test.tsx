import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PatientStatusBadge } from './PatientStatusBadge'

describe('PatientStatusBadge', () => {
  it('muestra "IA activa" cuando status === "active"', () => {
    render(
      <PatientStatusBadge threadState={{ status: 'active', paused_reason: null }} />
    )
    expect(screen.getByText('IA activa')).toBeInTheDocument()
    expect(screen.getByLabelText(/estado del agente: IA activa/i)).toBeInTheDocument()
  })

  it('muestra "Transferida" cuando status === "paused" y paused_reason === "human_takeover"', () => {
    render(
      <PatientStatusBadge
        threadState={{ status: 'paused', paused_reason: 'human_takeover' }}
      />
    )
    expect(screen.getByText('Transferida')).toBeInTheDocument()
  })

  it('muestra "Necesita ayuda" cuando status === "paused" y paused_reason === "low_confidence"', () => {
    render(
      <PatientStatusBadge
        threadState={{ status: 'paused', paused_reason: 'low_confidence' }}
      />
    )
    expect(screen.getByText('Necesita ayuda')).toBeInTheDocument()
  })

  it('muestra "Sin conversación activa" cuando threadState es null', () => {
    render(<PatientStatusBadge threadState={null} />)
    expect(screen.getByText('Sin conversación activa')).toBeInTheDocument()
  })

  it('muestra "Sin conversación activa" cuando threadState es undefined', () => {
    render(<PatientStatusBadge threadState={undefined} />)
    expect(screen.getByText('Sin conversación activa')).toBeInTheDocument()
  })
})

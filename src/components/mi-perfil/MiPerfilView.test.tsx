import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiPerfilView } from './MiPerfilView'

vi.mock('./AccountDataSection', () => ({
  AccountDataSection: ({ role }: { role: string }) => (
    <div data-testid="account-data-section">AccountDataSection:{role}</div>
  ),
}))

vi.mock('./ProfessionalDataSection', () => ({
  ProfessionalDataSection: () => (
    <div data-testid="professional-data-section">ProfessionalDataSection</div>
  ),
}))

describe('MiPerfilView', () => {
  it('renderiza AccountDataSection para rol admin', () => {
    render(<MiPerfilView role="admin" />)
    expect(screen.getByTestId('account-data-section')).toBeInTheDocument()
  })

  it('renderiza AccountDataSection para rol receptionist', () => {
    render(<MiPerfilView role="receptionist" />)
    expect(screen.getByTestId('account-data-section')).toBeInTheDocument()
  })

  it('renderiza ProfessionalDataSection cuando el rol es doctor', () => {
    render(<MiPerfilView role="doctor" />)
    expect(screen.getByTestId('account-data-section')).toBeInTheDocument()
    expect(screen.getByTestId('professional-data-section')).toBeInTheDocument()
  })

  it('NO renderiza ProfessionalDataSection para admin ni receptionist', () => {
    const { rerender } = render(<MiPerfilView role="admin" />)
    expect(screen.queryByTestId('professional-data-section')).not.toBeInTheDocument()
    rerender(<MiPerfilView role="receptionist" />)
    expect(screen.queryByTestId('professional-data-section')).not.toBeInTheDocument()
  })
})

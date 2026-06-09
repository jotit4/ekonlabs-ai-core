import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SesionSerieBadge } from './SesionSerieBadge'

describe('SesionSerieBadge', () => {
  it('sin sessionIndex (null) → no renderiza nada', () => {
    const { container } = render(
      <SesionSerieBadge sessionIndex={null} totalSessions={10} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sin sessionIndex (undefined) → no renderiza nada', () => {
    const { container } = render(
      <SesionSerieBadge sessionIndex={undefined} totalSessions={undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('con index pero sin total → "Sesión {index}" (degradado)', () => {
    render(<SesionSerieBadge sessionIndex={3} totalSessions={null} />)
    expect(screen.getByText('Sesión 3')).toBeInTheDocument()
  })

  it('con index y total → "Sesión {index}/{total}"', () => {
    render(<SesionSerieBadge sessionIndex={3} totalSessions={10} />)
    expect(screen.getByText('Sesión 3/10')).toBeInTheDocument()
  })

  it('totalSessions=0 degrada a "Sesión {index}" (sin /0)', () => {
    render(<SesionSerieBadge sessionIndex={1} totalSessions={0} />)
    expect(screen.getByText('Sesión 1')).toBeInTheDocument()
  })

  it('expone aria-label descriptivo cuando hay serie completa', () => {
    render(<SesionSerieBadge sessionIndex={3} totalSessions={10} />)
    expect(screen.getByLabelText('Parte de una serie: Sesión 3/10')).toBeInTheDocument()
  })
})

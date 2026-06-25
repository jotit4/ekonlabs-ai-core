import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { PulsoCard } from './PulsoCard'

describe('PulsoCard', () => {
  it('sin href: renderiza como div estático (no link)', () => {
    const { container } = render(
      <PulsoCard
        icono={<span data-testid="ico" />}
        tono="interactive"
        valor={5}
        titulo="turnos para hoy"
        ayuda="Reservados para todos los profesionales"
      />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('turnos para hoy')).toBeInTheDocument()
    expect(screen.getByText('Reservados para todos los profesionales')).toBeInTheDocument()
  })

  it('con href: renderiza como enlace con la URL correcta', () => {
    render(
      <PulsoCard
        icono={<span />}
        tono="ok"
        valor="42%"
        titulo="de la agenda ocupada"
        ayuda="Este mes"
        href="/metricas"
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/metricas')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('deeplink /agenda?vista=dia se preserva (querystring incluida)', () => {
    render(
      <PulsoCard
        icono={<span />}
        tono="interactive"
        valor={7}
        titulo="turnos para hoy"
        ayuda="hoy"
        href="/agenda?vista=dia"
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/agenda?vista=dia')
  })

  it('tono warn aplica clases del mapa de tono', () => {
    const { container } = render(
      <PulsoCard
        icono={<span />}
        tono="warn"
        valor={2}
        titulo="personas faltaron"
        ayuda="Este mes"
      />,
    )
    // El span del ícono debe contener la clase de tono warn
    const iconSpan = container.querySelector('[aria-hidden="true"]')
    expect(iconSpan?.className).toContain('color-status-warn')
  })
})

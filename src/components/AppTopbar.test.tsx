import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { AppTopbar } from './AppTopbar'

let mockPathname = '/agenda'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('AppTopbar', () => {
  it('recepción en /pacientes: botón Inicio → /recepcion y muestra el módulo "Pacientes"', () => {
    mockPathname = '/pacientes'
    render(<AppTopbar role="receptionist" />)
    const inicio = screen.getByRole('link', { name: /inicio/i })
    expect(inicio).toHaveAttribute('href', '/recepcion')
    expect(screen.getByText('Pacientes')).toBeTruthy()
  })

  it('profesional en /conversaciones: botón Inicio → /mi-jornada', () => {
    mockPathname = '/conversaciones'
    render(<AppTopbar role="doctor" />)
    const inicio = screen.getByRole('link', { name: /inicio/i })
    expect(inicio).toHaveAttribute('href', '/mi-jornada')
    expect(screen.getByText('Conversaciones')).toBeTruthy()
  })

  it('dueño en /metricas: botón Inicio → /inicio y muestra "Métricas"', () => {
    mockPathname = '/metricas'
    render(<AppTopbar role="admin" />)
    const inicio = screen.getByRole('link', { name: /inicio/i })
    expect(inicio).toHaveAttribute('href', '/inicio')
    expect(screen.getByText('Métricas')).toBeTruthy()
  })

  it('subruta /pacientes/123: el título se deriva del módulo ("Pacientes")', () => {
    mockPathname = '/pacientes/123'
    render(<AppTopbar role="admin" />)
    expect(screen.getByText('Pacientes')).toBeTruthy()
  })

  it('en el propio inicio: el botón Inicio queda marcado (aria-current=page) y sin "/módulo" redundante', () => {
    mockPathname = '/inicio'
    render(<AppTopbar role="admin" />)
    const inicio = screen.getByRole('link', { name: /inicio/i })
    expect(inicio).toHaveAttribute('href', '/inicio')
    expect(inicio).toHaveAttribute('aria-current', 'page')
    // No debe duplicar "Inicio / Inicio": el único "Inicio" es el del botón.
    expect(screen.getAllByText('Inicio')).toHaveLength(1)
  })

  describe('botón "Volver"', () => {
    it('subruta /pacientes/123 (admin): Volver sube al módulo raíz "/pacientes"', () => {
      mockPathname = '/pacientes/123'
      render(<AppTopbar role="admin" />)
      const volver = screen.getByRole('link', { name: /volver/i })
      expect(volver).toHaveAttribute('href', '/pacientes')
    })

    it('subruta /configuracion/agente (admin): Volver sube a "/configuracion"', () => {
      mockPathname = '/configuracion/agente'
      render(<AppTopbar role="admin" />)
      const volver = screen.getByRole('link', { name: /volver/i })
      expect(volver).toHaveAttribute('href', '/configuracion')
    })

    it('módulo raíz /agenda (recepción): Volver va al landing del rol "/recepcion"', () => {
      mockPathname = '/agenda'
      render(<AppTopbar role="receptionist" />)
      const volver = screen.getByRole('link', { name: /volver/i })
      expect(volver).toHaveAttribute('href', '/recepcion')
    })

    it('módulo raíz /conversaciones (doctor): Volver va al landing del rol "/mi-jornada"', () => {
      mockPathname = '/conversaciones'
      render(<AppTopbar role="doctor" />)
      const volver = screen.getByRole('link', { name: /volver/i })
      expect(volver).toHaveAttribute('href', '/mi-jornada')
    })

    it('en el propio landing del rol (/recepcion para recepción): Volver no se muestra', () => {
      mockPathname = '/recepcion'
      render(<AppTopbar role="receptionist" />)
      expect(screen.queryByRole('link', { name: /volver/i })).toBeNull()
    })

    it('en el propio landing del rol (/inicio para admin): Volver no se muestra', () => {
      mockPathname = '/inicio'
      render(<AppTopbar role="admin" />)
      expect(screen.queryByRole('link', { name: /volver/i })).toBeNull()
    })
  })

  describe('breadcrumb clickeable', () => {
    it('el nombre del módulo en el breadcrumb es un link a la raíz del módulo', () => {
      mockPathname = '/pacientes/123'
      render(<AppTopbar role="admin" />)
      const modulo = screen.getByRole('link', { name: 'Pacientes' })
      expect(modulo).toHaveAttribute('href', '/pacientes')
    })

    it('"Inicio" del breadcrumb es el mismo botón, ya es link al landing del rol', () => {
      mockPathname = '/agenda'
      render(<AppTopbar role="doctor" />)
      const inicio = screen.getByRole('link', { name: /inicio/i })
      expect(inicio).toHaveAttribute('href', '/mi-jornada')
    })
  })
})

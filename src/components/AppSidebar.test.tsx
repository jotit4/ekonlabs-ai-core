import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { AppSidebar } from './AppSidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/agenda',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('AppSidebar', () => {
  it('receptionist: muestra Conversaciones, Agenda, Pacientes', () => {
    render(<AppSidebar role="receptionist" />)
    expect(screen.getAllByText('Conversaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agenda').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pacientes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Configuración')).toBeNull()
    expect(screen.queryByText('Métricas')).toBeNull()
  })

  it('doctor: muestra solo Agenda, Pacientes', () => {
    render(<AppSidebar role="doctor" />)
    expect(screen.getAllByText('Agenda').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pacientes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Conversaciones')).toBeNull()
  })

  it('admin: muestra todos los módulos', () => {
    render(<AppSidebar role="admin" />)
    expect(screen.getAllByText('Conversaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Configuración').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Métricas').length).toBeGreaterThan(0)
  })

  it('toggle colapsa y expande el sidebar', async () => {
    const user = userEvent.setup()
    render(<AppSidebar role="receptionist" />)
    const toggle = screen.getByRole('button', { name: /colapsar/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /expandir/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('marca aria-current=page en link activo (/agenda)', () => {
    render(<AppSidebar role="receptionist" />)
    const agendaLinks = screen.getAllByRole('link', { name: /agenda/i })
    expect(agendaLinks.some((l) => l.getAttribute('aria-current') === 'page')).toBe(true)
  })
})

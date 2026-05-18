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

vi.mock('./UserProfileButton', () => ({
  UserProfileButton: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="user-profile-button" data-collapsed={String(collapsed)}>
      UserProfileButton
    </div>
  ),
}))

describe('AppSidebar', () => {
  it('receptionist: muestra Conversaciones, Calendario, Pacientes, Profesionales', () => {
    render(<AppSidebar role="receptionist" />)
    expect(screen.getAllByText('Conversaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Calendario').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pacientes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Profesionales').length).toBeGreaterThan(0)
    expect(screen.queryByText('Configuración')).toBeNull()
    expect(screen.queryByText('Métricas')).toBeNull()
  })

  it('doctor: muestra Calendario y Mi Agenda como ítems separados', () => {
    render(<AppSidebar role="doctor" />)
    expect(screen.getAllByText('Calendario').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mi Agenda').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pacientes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mi Disponibilidad').length).toBeGreaterThan(0)
    expect(screen.queryByText('Conversaciones')).toBeNull()
  })

  it('doctor: tiene ítems separados para Calendario y Mi Agenda (hrefs distintos)', () => {
    render(<AppSidebar role="doctor" />)
    const calendarLinks = screen.getAllByRole('link', { name: /calendario/i })
    const miAgendaLinks = screen.getAllByRole('link', { name: /mi agenda/i })
    expect(calendarLinks.some((l) => l.getAttribute('href') === '/agenda')).toBe(true)
    expect(miAgendaLinks.some((l) => l.getAttribute('href') === '/agenda/mi-agenda')).toBe(true)
  })

  it('receptionist: NO muestra Mi Agenda', () => {
    render(<AppSidebar role="receptionist" />)
    expect(screen.queryByText('Mi Agenda')).toBeNull()
  })

  it('admin: NO muestra Mi Agenda', () => {
    render(<AppSidebar role="admin" />)
    expect(screen.queryByText('Mi Agenda')).toBeNull()
  })

  it('doctor: tiene ítem Mi Disponibilidad con href=/mi-disponibilidad', () => {
    render(<AppSidebar role="doctor" />)
    const links = screen.getAllByRole('link', { name: /mi disponibilidad/i })
    expect(links.some((l) => l.getAttribute('href') === '/mi-disponibilidad')).toBe(true)
  })

  it('receptionist: NO muestra Mi Disponibilidad', () => {
    render(<AppSidebar role="receptionist" />)
    expect(screen.queryByText('Mi Disponibilidad')).toBeNull()
  })

  it('admin: NO muestra Mi Disponibilidad', () => {
    render(<AppSidebar role="admin" />)
    expect(screen.queryByText('Mi Disponibilidad')).toBeNull()
  })

  it('admin: muestra todos los módulos', () => {
    render(<AppSidebar role="admin" />)
    expect(screen.getAllByText('Conversaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Calendario').length).toBeGreaterThan(0)
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
    const calendarLinks = screen.getAllByRole('link', { name: /calendario/i })
    expect(calendarLinks.some((l) => l.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('sidebar desktop renderiza UserProfileButton con collapsed=false cuando está expandido', () => {
    render(<AppSidebar role="receptionist" />)
    const buttons = screen.getAllByTestId('user-profile-button')
    // El primero pertenece al sidebar desktop (expandido por defecto)
    expect(buttons.some((b) => b.getAttribute('data-collapsed') === 'false')).toBe(true)
  })

  it('sidebar desktop renderiza UserProfileButton con collapsed=true cuando está colapsado', async () => {
    const user = userEvent.setup()
    render(<AppSidebar role="receptionist" />)
    const toggle = screen.getByRole('button', { name: /colapsar/i })
    await user.click(toggle)
    // Después de colapsar, el sidebar desktop debe tener collapsed=true
    const buttons = screen.getAllByTestId('user-profile-button')
    expect(buttons.some((b) => b.getAttribute('data-collapsed') === 'true')).toBe(true)
  })

  it('nav mobile renderiza UserProfileButton con collapsed=true', () => {
    render(<AppSidebar role="receptionist" />)
    const buttons = screen.getAllByTestId('user-profile-button')
    // Mobile nav siempre renderiza con collapsed=true
    expect(buttons.some((b) => b.getAttribute('data-collapsed') === 'true')).toBe(true)
  })
})

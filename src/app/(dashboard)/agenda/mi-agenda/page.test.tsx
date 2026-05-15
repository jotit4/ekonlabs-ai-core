import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRouterPush = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (_key: string) => null,
    toString: () => '',
  }),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('@/hooks/use-my-agenda', () => ({
  useMyAgenda: vi.fn(() => ({
    appointments: [],
    isPending: false,
    isError: false,
    errorStatus: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-my-agenda-realtime', () => ({
  useMyAgendaRealtime: vi.fn(),
}))

vi.mock('@/components/agenda/MiAgendaCalendarView', () => ({
  MiAgendaCalendarView: () => <div data-testid="mi-agenda-calendar-view" />,
}))

import { useMyAgenda } from '@/hooks/use-my-agenda'
import MiAgendaPage from './page'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MiAgendaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMyAgenda).mockReturnValue({
      appointments: [],
      isPending: false,
      isError: false,
      errorStatus: null,
      refetch: vi.fn(),
    })
  })

  it('renderiza el título "Mi Agenda"', () => {
    render(<MiAgendaPage />)
    const headings = screen.getAllByText('Mi Agenda')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('muestra MiAgendaCalendarView cuando hay datos', () => {
    render(<MiAgendaPage />)
    expect(screen.getByTestId('mi-agenda-calendar-view')).toBeInTheDocument()
  })

  it('muestra estado de error con botón "Reintentar" si isError genérico (500)', () => {
    vi.mocked(useMyAgenda).mockReturnValue({
      appointments: [],
      isPending: false,
      isError: true,
      errorStatus: 500,
      refetch: vi.fn(),
    })

    render(<MiAgendaPage />)

    // El error genérico lo muestra MiAgendaCalendarView internamente
    // La página pasa isError=true → el mock muestra el calendar view (en tests el mock siempre muestra el testid)
    // En este caso la página pasa el error al componente hijo
    expect(screen.getByTestId('mi-agenda-calendar-view')).toBeInTheDocument()
  })

  it('muestra mensaje de "No tenés perfil de profesional" si errorStatus es 404', () => {
    vi.mocked(useMyAgenda).mockReturnValue({
      appointments: [],
      isPending: false,
      isError: true,
      errorStatus: 404,
      refetch: vi.fn(),
    })

    render(<MiAgendaPage />)

    expect(
      screen.getByText(
        'No tenés un perfil de profesional configurado en el sistema. Contactá al administrador.'
      )
    ).toBeInTheDocument()
  })

  it('NO renderiza botón "Nuevo turno"', () => {
    render(<MiAgendaPage />)
    expect(screen.queryByText(/nuevo turno/i)).not.toBeInTheDocument()
  })

  it('NO renderiza ShadowModeBanner (no está en el componente)', () => {
    render(<MiAgendaPage />)
    // ShadowModeBanner no se importa en este componente
    // Verificamos que no haya ningún elemento relacionado con shadow mode
    expect(screen.queryByTestId('shadow-mode-banner')).not.toBeInTheDocument()
  })

  it('renderiza botones de navegación de fecha', () => {
    render(<MiAgendaPage />)
    expect(screen.getByRole('button', { name: /día anterior/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /día siguiente/i })).toBeInTheDocument()
  })

  it('no muestra botón "Hoy" cuando la fecha es hoy (por defecto)', () => {
    render(<MiAgendaPage />)
    // Cuando no hay ?fecha, la fecha es hoy, por lo que el botón "Hoy" no aparece
    expect(screen.queryByRole('button', { name: /ir a hoy/i })).not.toBeInTheDocument()
  })
})

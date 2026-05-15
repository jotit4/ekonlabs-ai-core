import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRouterPush = vi.fn()

// We need dynamic searchParams so we can control ?vista
let mockSearchParamsData: Record<string, string> = {}

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsData[key] ?? null,
    toString: () => {
      const p = new URLSearchParams(mockSearchParamsData)
      return p.toString()
    },
  }),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('@/hooks/use-agenda-realtime', () => ({
  useAgendaRealtime: vi.fn(),
}))

vi.mock('@/hooks/use-appointments', () => ({
  useAppointments: vi.fn(() => ({
    appointments: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-appointments-range', () => ({
  useAppointmentsRange: vi.fn(() => ({
    appointments: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-gcal-channel-status', () => ({
  useGCalChannelStatus: vi.fn(() => ({ status: 'ok' })),
}))

vi.mock('@/hooks/use-tenant-config', () => ({
  useTenantConfig: vi.fn(() => ({ usesNativeCalendar: false, isPending: false })),
}))

vi.mock('@/components/agenda/SyncStatusBanner', () => ({
  SyncStatusBanner: () => <div data-testid="sync-status-banner" />,
}))

vi.mock('@/components/agenda/GCalDegradationBanner', () => ({
  GCalDegradationBanner: () => <div data-testid="gcal-degradation-banner" />,
}))

vi.mock('@/hooks/use-user-role', () => ({
  useUserRole: vi.fn(() => null),
}))

vi.mock('@/components/agenda/CalendarView', () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}))

vi.mock('@/components/agenda/CalendarViewRangeReadOnly', () => ({
  CalendarViewRangeReadOnly: () => <div data-testid="calendar-view-range" />,
}))

vi.mock('@/components/agenda/CalendarViewSelector', () => ({
  CalendarViewSelector: ({
    activeView,
    onChange,
  }: {
    activeView: string
    onChange: (v: string) => void
  }) => (
    <div data-testid="calendar-view-selector" data-active-view={activeView}>
      <button onClick={() => onChange('dia')}>Día</button>
      <button onClick={() => onChange('semana')}>Semana</button>
      <button onClick={() => onChange('mes')}>Mes</button>
    </div>
  ),
}))

vi.mock('@/components/agenda/TurnoDetailModal', () => ({
  TurnoDetailModal: () => <div data-testid="turno-detail-modal" />,
}))

vi.mock('@/components/agenda/KPIStrip', () => ({
  KPIStrip: () => <div data-testid="kpi-strip" />,
}))

vi.mock('@/components/agenda/NewTurnoModal', () => ({
  NewTurnoModal: () => null,
}))

vi.mock('@/components/agenda/RescheduleTurnoModal', () => ({
  RescheduleTurnoModal: () => null,
}))

vi.mock('@/components/agenda/AgendaFilters', () => ({
  AgendaFilters: ({ showFilters }: { showFilters: boolean }) =>
    showFilters ? <div data-testid="agenda-filters" /> : null,
}))

import AgendaPage from './page'
import { useUserRole } from '@/hooks/use-user-role'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsData = {}
    vi.mocked(useUserRole).mockReturnValue(null)
    vi.mocked(useAppointments).mockReturnValue({
      appointments: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      overtime: {},
    })
    vi.mocked(useAppointmentsRange).mockReturnValue({
      appointments: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, isPending: false })
  })

  it('sin ?vista en URL → renderiza CalendarView (vista día)', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view-range')).not.toBeInTheDocument()
  })

  it('?vista=semana → renderiza CalendarViewRangeReadOnly y NO CalendarView día', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.getByTestId('calendar-view-range')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
  })

  it('?vista=mes → renderiza CalendarViewRangeReadOnly y NO CalendarView día', () => {
    mockSearchParamsData = { vista: 'mes' }
    render(<AgendaPage />)
    expect(screen.getByTestId('calendar-view-range')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
  })

  it('KPIStrip solo aparece en vista día (no en semana)', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.queryByTestId('kpi-strip')).not.toBeInTheDocument()
  })

  it('KPIStrip aparece en vista día', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument()
  })

  it('al hacer click en "Semana" en CalendarViewSelector, router push incluye ?vista=semana', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    const semanaBtn = screen.getByRole('button', { name: 'Semana' })
    fireEvent.click(semanaBtn)
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('vista=semana'))
  })

  it('al hacer click en "Día" en CalendarViewSelector, router push no incluye ?vista', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    const diaBtn = screen.getByRole('button', { name: 'Día' })
    fireEvent.click(diaBtn)
    const callArg = mockRouterPush.mock.calls[0][0] as string
    expect(callArg).not.toContain('vista=dia')
    expect(callArg).not.toContain('vista=semana')
  })

  it('el botón "+ Nuevo turno" solo aparece en vista día', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo turno/i })).toBeInTheDocument()
  })

  it('el botón "+ Nuevo turno" NO aparece en vista semana', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.queryByRole('button', { name: /nuevo turno/i })).not.toBeInTheDocument()
  })

  it('muestra AgendaFilters cuando el rol es admin', () => {
    vi.mocked(useUserRole).mockReturnValue('admin')
    render(<AgendaPage />)
    expect(screen.getByTestId('agenda-filters')).toBeInTheDocument()
  })

  it('NO muestra AgendaFilters cuando el rol es receptionist', () => {
    vi.mocked(useUserRole).mockReturnValue('receptionist')
    render(<AgendaPage />)
    expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
  })

  it('NO muestra AgendaFilters cuando el rol no está cargado (null)', () => {
    vi.mocked(useUserRole).mockReturnValue(null)
    render(<AgendaPage />)
    expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
  })

  it('al hacer click en Anterior en vista día, navega preservando params de la URL', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    const prevButton = screen.getByRole('button', { name: /día anterior/i })
    fireEvent.click(prevButton)
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/agenda?'))
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('fecha='))
  })

  it('al hacer click en Siguiente en vista día, navega preservando params de la URL', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    const nextButton = screen.getByRole('button', { name: /día siguiente/i })
    fireEvent.click(nextButton)
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/agenda?'))
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('fecha='))
  })

  it('con ?vista=semana, el botón anterior tiene aria-label "Semana anterior"', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /semana anterior/i })).toBeInTheDocument()
  })

  describe('condicionalidad GCal según uses_native_calendar', () => {
    it('muestra banners GCal cuando usesNativeCalendar=false y vista día', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, isPending: false })
      render(<AgendaPage />)
      expect(screen.getByTestId('sync-status-banner')).toBeInTheDocument()
      expect(screen.getByTestId('gcal-degradation-banner')).toBeInTheDocument()
    })

    it('NO muestra banners GCal cuando usesNativeCalendar=true', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: true, isPending: false })
      render(<AgendaPage />)
      expect(screen.queryByTestId('sync-status-banner')).not.toBeInTheDocument()
      expect(screen.queryByTestId('gcal-degradation-banner')).not.toBeInTheDocument()
    })

    it('cuando usesNativeCalendar=true, useGCalChannelStatus se llama con enabled=false', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: true, isPending: false })
      render(<AgendaPage />)
      expect(vi.mocked(useGCalChannelStatus)).toHaveBeenCalledWith(false)
    })

    it('cuando tenantConfig está pendiente (isPending=true), useGCalChannelStatus se llama con enabled=false', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, isPending: true })
      render(<AgendaPage />)
      expect(vi.mocked(useGCalChannelStatus)).toHaveBeenCalledWith(false)
    })
  })
})

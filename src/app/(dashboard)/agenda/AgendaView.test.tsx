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

vi.mock('@/hooks/use-availability', () => ({
  useAvailability: vi.fn(() => ({
    daysShifts: {},
    daysSummary: {},
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    shiftsForDate: () => [],
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

// Mock de NewPaqueteModal (Story 13.5) — usa useList de Refine, sin provider en este test
vi.mock('@/components/paquetes/NewPaqueteModal', () => ({
  NewPaqueteModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-paquete-modal" /> : null,
}))

vi.mock('@/components/agenda/AgendaFilters', () => ({
  AgendaFilters: ({
    showFilters,
    onProfessionalChange,
    onServiceChange,
  }: {
    showFilters: boolean
    onProfessionalChange: (id: string | null) => void
    onServiceChange: (id: string | null) => void
  }) =>
    showFilters ? (
      <div data-testid="agenda-filters">
        {/* Botones stub para ejercitar la exclusión mutua desde AgendaView */}
        <button onClick={() => onProfessionalChange('prof-1')}>mock-pick-prof</button>
        <button onClick={() => onServiceChange('svc-1')}>mock-pick-svc</button>
      </div>
    ) : null,
}))

import { AgendaView as AgendaPage } from './AgendaView'
import { useUserRole } from '@/hooks/use-user-role'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useAvailability } from '@/hooks/use-availability'
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
    vi.mocked(useAvailability).mockReturnValue({
      daysShifts: {},
      daysSummary: {},
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      shiftsForDate: () => [],
    })
  })

  it('sin ?vista en URL → renderiza vista Semana (default, AC6)', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    expect(screen.getByTestId('calendar-view-range')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
  })

  it('?vista=dia → renderiza CalendarView (vista día)', () => {
    mockSearchParamsData = { vista: 'dia' }
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

  it('llama useAvailability con summary=true en vista mes', () => {
    mockSearchParamsData = { vista: 'mes' }
    render(<AgendaPage />)
    expect(vi.mocked(useAvailability)).toHaveBeenCalledWith(
      expect.objectContaining({ summary: true }),
    )
  })

  it('llama useAvailability con summary=false en vista semana (default)', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    expect(vi.mocked(useAvailability)).toHaveBeenCalledWith(
      expect.objectContaining({ summary: false }),
    )
  })

  it('KPIStrip solo aparece en vista día (no en semana)', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.queryByTestId('kpi-strip')).not.toBeInTheDocument()
  })

  it('KPIStrip aparece en vista día', () => {
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument()
  })

  it('al hacer click en "Día" en CalendarViewSelector, router push incluye ?vista=dia', () => {
    mockSearchParamsData = {}
    render(<AgendaPage />)
    const diaBtn = screen.getByRole('button', { name: 'Día' })
    fireEvent.click(diaBtn)
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('vista=dia'))
  })

  it('al hacer click en "Semana" en CalendarViewSelector, router push no incluye ?vista', () => {
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    const semanaBtn = screen.getByRole('button', { name: 'Semana' })
    fireEvent.click(semanaBtn)
    const callArg = mockRouterPush.mock.calls[0][0] as string
    expect(callArg).not.toContain('vista=dia')
    expect(callArg).not.toContain('vista=semana')
  })

  it('el botón "+ Nuevo turno" aparece en vista día', () => {
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo turno/i })).toBeInTheDocument()
  })

  it('el botón "+ Nuevo turno" aparece en vista semana', () => {
    mockSearchParamsData = { vista: 'semana' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo turno/i })).toBeInTheDocument()
  })

  it('el botón "+ Nuevo turno" también aparece en vista mes (agendar desde Mes)', () => {
    mockSearchParamsData = { vista: 'mes' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo turno/i })).toBeInTheDocument()
  })

  // ── CTA secundario "+ Nuevo paquete" (Story 13.5) ──────────────────────────
  it('el CTA "+ Nuevo paquete" aparece para admin en vista día', () => {
    vi.mocked(useUserRole).mockReturnValue('admin')
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo paquete/i })).toBeInTheDocument()
  })

  it('el CTA "+ Nuevo paquete" también aparece para admin en vista mes', () => {
    vi.mocked(useUserRole).mockReturnValue('admin')
    mockSearchParamsData = { vista: 'mes' }
    render(<AgendaPage />)
    expect(screen.getByRole('button', { name: /nuevo paquete/i })).toBeInTheDocument()
  })

  it('el CTA "+ Nuevo paquete" NO aparece cuando el rol no está cargado (null)', () => {
    vi.mocked(useUserRole).mockReturnValue(null)
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    expect(screen.queryByRole('button', { name: /nuevo paquete/i })).not.toBeInTheDocument()
  })

  it('al hacer click en "+ Nuevo paquete" abre el NewPaqueteModal (sin initialPatient)', () => {
    // Admin ve "Nuevo paquete" siempre visible (agenda completa).
    vi.mocked(useUserRole).mockReturnValue('admin')
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    fireEvent.click(screen.getByRole('button', { name: /nuevo paquete/i }))
    expect(screen.getByTestId('new-paquete-modal')).toBeInTheDocument()
  })

  // ── Modo turnero (recepción) vs agenda completa (admin) ────────────────────
  describe('Modo turnero (receptionist) vs agenda completa (admin)', () => {
    it('admin: muestra AgendaFilters y selector de vista por defecto, sin botón "Filtrar"', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      expect(screen.getByTestId('agenda-filters')).toBeInTheDocument()
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^filtrar$/i })).not.toBeInTheDocument()
    })

    it('receptionist: por defecto NO muestra filtros ni selector de vista, pero sí "Dar turno" + "Filtrar"', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view-selector')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /nuevo paquete/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /dar turno/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^filtrar$/i })).toBeInTheDocument()
    })

    it('receptionist: al hacer click en "Filtrar" se revelan filtros, selector de vista y "Nuevo paquete"', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      const filtrarBtn = screen.getByRole('button', { name: /^filtrar$/i })
      expect(filtrarBtn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(filtrarBtn)
      expect(filtrarBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByTestId('agenda-filters')).toBeInTheDocument()
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /nuevo paquete/i })).toBeInTheDocument()
    })

    it('NO muestra AgendaFilters cuando el rol no está cargado (null)', () => {
      vi.mocked(useUserRole).mockReturnValue(null)
      render(<AgendaPage />)
      expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
    })
  })

  // ── FIX A — rol del server (initialRole) evita el parpadeo de cabecera ──────
  describe('initialRole (rol del server, sin parpadeo)', () => {
    it('con initialRole="receptionist" arranca en modo turnero aunque useUserRole aún sea null', () => {
      // Simula el primer frame: el hook cliente todavía no resolvió (null), pero
      // el rol del server ya define el modo turnero → sin flash de agenda completa.
      vi.mocked(useUserRole).mockReturnValue(null)
      render(<AgendaPage initialRole="receptionist" />)
      expect(screen.getByRole('button', { name: /^filtrar$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /dar turno/i })).toBeInTheDocument()
      expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
    })

    it('con initialRole="admin" arranca en agenda completa aunque useUserRole aún sea null', () => {
      vi.mocked(useUserRole).mockReturnValue(null)
      render(<AgendaPage initialRole="admin" />)
      expect(screen.getByTestId('agenda-filters')).toBeInTheDocument()
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^filtrar$/i })).not.toBeInTheDocument()
    })

    it('useUserRole (cliente) prevalece una vez resuelto sobre un initialRole ausente', () => {
      // El server no determinó el rol (initialRole null) pero el cliente resuelve admin.
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage initialRole={null} />)
      expect(screen.getByTestId('agenda-filters')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^filtrar$/i })).not.toBeInTheDocument()
    })
  })

  // ── Exclusión mutua professional_id ⊕ service_id ───────────────────────────
  describe('Exclusión mutua profesional/servicio', () => {
    it('elegir profesional (con service_id en URL) limpia el servicio en un solo push', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { service_id: 'svc-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-prof' }))
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).toContain('professional_id=prof-1')
      expect(url).not.toContain('service_id')
    })

    it('elegir servicio (con professional_id en URL) limpia el profesional en un solo push', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { professional_id: 'prof-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-svc' }))
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).toContain('service_id=svc-1')
      expect(url).not.toContain('professional_id')
    })
  })

  it('al hacer click en Anterior en vista día, navega preservando params de la URL', () => {
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    const prevButton = screen.getByRole('button', { name: /día anterior/i })
    fireEvent.click(prevButton)
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/agenda?'))
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('fecha='))
  })

  it('al hacer click en Siguiente en vista día, navega preservando params de la URL', () => {
    mockSearchParamsData = { vista: 'dia' }
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
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, isPending: false })
      render(<AgendaPage />)
      expect(screen.getByTestId('sync-status-banner')).toBeInTheDocument()
      expect(screen.getByTestId('gcal-degradation-banner')).toBeInTheDocument()
    })

    it('NO muestra banners GCal cuando usesNativeCalendar=true', () => {
      mockSearchParamsData = { vista: 'dia' }
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

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

// Feriados + estado del día (pedido ISADI 2026-07-14) — mockeados igual que
// el resto de los hooks de datos: CalendarViewRangeReadOnly también está
// mockeado más abajo, así que estos hooks solo importan para que AgendaView
// no truene por falta de QueryClientProvider en este test.
vi.mock('@/hooks/use-day-status', () => ({
  useDayStatusRange: vi.fn(() => ({ days: {}, isLoading: false, isError: false, refetch: vi.fn() })),
}))

vi.mock('@/hooks/use-set-day-status', () => ({
  useSetDayStatus: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock('@/components/agenda/DayStatusModal', () => ({
  DayStatusModal: ({ open }: { open: boolean }) => (open ? <div data-testid="day-status-modal" /> : null),
}))

vi.mock('@/hooks/use-gcal-channel-status', () => ({
  useGCalChannelStatus: vi.fn(() => ({ status: 'ok' })),
}))

vi.mock('@/hooks/use-tenant-config', () => ({
  useTenantConfig: vi.fn(() => ({ usesNativeCalendar: false, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: false, isError: false, refetch: vi.fn() })),
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

// Story 16.2 — cola de orden de llegada. Mockeamos el hook resolver y el panel
// (stub con data-testid) para aislar el GATING de montaje en AgendaView, sin
// arrastrar el árbol real del panel (que trae su propio realtime + Refine).
vi.mock('@/hooks/use-walk-in-service', () => ({
  useWalkInService: vi.fn(() => null),
}))

vi.mock('@/components/recepcion/ColaOrdenLlegada', () => ({
  ColaOrdenLlegada: ({
    serviceId,
    professionalId,
    hoyISO,
  }: {
    serviceId: string
    professionalId: string
    hoyISO: string
  }) => (
    <div
      data-testid="cola-orden-llegada"
      data-service-id={serviceId}
      data-professional-id={professionalId}
      data-hoy-iso={hoyISO}
    />
  ),
}))

// El mock replica el orden de ramas isLoading → isError → grilla del
// CalendarView real (ver CalendarView.tsx) — necesario para los tests de
// "config del tenant pendiente/en error" (fix de code review): sin esto, el
// mock siempre pintaría los turnos recibidos sin importar isLoading/isError,
// y no podríamos afirmar "no se ve ningún turno" mientras la config no
// resolvió.
vi.mock('@/components/agenda/CalendarView', () => ({
  CalendarView: ({
    appointments,
    isLoading,
    isError,
    onRefetch,
    onEmptyCellClick,
  }: {
    appointments?: { appointment_id?: string }[]
    isLoading?: boolean
    isError?: boolean
    onRefetch?: () => void
    onEmptyCellClick?: (date: string, timeHHmm: string, professionalId?: string) => void
  }) => {
    if (isLoading) return <div data-testid="calendar-view-skeleton" />
    if (isError) {
      return (
        <div data-testid="calendar-view-error">
          <button onClick={() => onRefetch?.()}>mock-reintentar</button>
        </div>
      )
    }
    return (
      <div data-testid="calendar-view" data-appt-count={appointments?.length ?? 0}>
        <button onClick={() => onEmptyCellClick?.('2026-07-14', '10:00', 'prof-9')}>
          mock-empty-cell-dia
        </button>
      </div>
    )
  },
}))

// Mismo criterio que el mock de CalendarView: replica el orden de ramas
// isLoading → isError → contenido del componente real (ver
// CalendarViewRangeReadOnly.tsx) — necesario para los tests de "config del
// tenant pendiente/en error" en la vista Semana/Mes, que es la vista por
// DEFAULT (sin `?vista` en la URL). Sin esto el mock siempre pintaría su
// contenido sin importar isLoading/isError, y ningún test detectaría que
// AgendaView dejó de pasarle `combinedRangeIsLoading`/`combinedRangeIsError`.
vi.mock('@/components/agenda/CalendarViewRangeReadOnly', () => ({
  CalendarViewRangeReadOnly: ({
    appointments,
    isLoading,
    isError,
    onRefetch,
    onEmptyCellClick,
    onDayStatusClick,
  }: {
    appointments?: { appointment_id?: string }[]
    isLoading?: boolean
    isError?: boolean
    onRefetch?: () => void
    onEmptyCellClick?: (date: string, timeHHmm: string) => void
    onDayStatusClick?: (date: string) => void
  }) => {
    if (isLoading) return <div data-testid="calendar-view-range-skeleton" />
    if (isError) {
      return (
        <div data-testid="calendar-view-range-error">
          <button onClick={() => onRefetch?.()}>mock-reintentar-semana</button>
        </div>
      )
    }
    return (
      <div data-testid="calendar-view-range" data-appt-count={appointments?.length ?? 0}>
        <button onClick={() => onEmptyCellClick?.('2026-07-15', '11:00')}>
          mock-empty-cell-semana
        </button>
        <button onClick={() => onDayStatusClick?.('2026-07-16')}>
          mock-day-status-click
        </button>
      </div>
    )
  },
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

// Mismo criterio que los mocks de CalendarView/CalendarViewRangeReadOnly:
// replica el orden de ramas isLoading → isError → KPIs del componente real
// (ver KPIStrip.tsx) — necesario para los tests de "config del tenant
// pendiente/en error" y de recorte por rehab: sin esto, el mock siempre
// pintaría el mismo testid sin importar isLoading/isError/appointments, y
// nadie detectaría un `isLoading={isLoading}` (turnos, sin combinar con la
// config) reintroducido por error.
vi.mock('@/components/agenda/KPIStrip', () => ({
  KPIStrip: ({
    appointments,
    isLoading,
    isError,
  }: {
    appointments?: { appointment_id?: string }[]
    isLoading?: boolean
    isError?: boolean
  }) => {
    if (isLoading) return <div data-testid="kpi-strip-skeleton" />
    if (isError) return <div data-testid="kpi-strip-error" />
    return <div data-testid="kpi-strip" data-appt-count={appointments?.length ?? 0} />
  },
}))

vi.mock('@/components/agenda/NewTurnoModal', () => ({
  NewTurnoModal: ({
    open,
    initialDate,
    initialTimeHHmm,
    initialProfessionalId,
    isReceptionist,
  }: {
    open: boolean
    initialDate?: string
    initialTimeHHmm?: string
    initialProfessionalId?: string
    isReceptionist?: boolean
  }) =>
    open ? (
      <div
        data-testid="new-turno-modal"
        data-date={initialDate}
        data-time={initialTimeHHmm}
        data-prof={initialProfessionalId}
        data-is-receptionist={String(!!isReceptionist)}
      />
    ) : null,
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
    onClear,
    hasReceptionGroup,
  }: {
    showFilters: boolean
    onProfessionalChange: (id: string | null) => void
    onClear: () => void
    hasReceptionGroup?: boolean
  }) =>
    showFilters ? (
      <div
        data-testid="agenda-filters"
        data-has-reception-group={String(!!hasReceptionGroup)}
      >
        {/* Botón stub para ejercitar la exclusión mutua desde AgendaView */}
        <button onClick={() => onProfessionalChange('prof-1')}>mock-pick-prof</button>
        {/* Botón stub de "Limpiar" — ejercita handleClearFilters desde AgendaView */}
        <button onClick={() => onClear()}>mock-limpiar</button>
      </div>
    ) : null,
  // Los botones de GRUPO viven en un componente aparte, siempre visible (para
  // todos los roles) — no gated por showFilters/secondaryVisible. Decisión
  // ISADI 2026-07-16: admin ve los mismos 3 grupos que recepción. La prop
  // pública quedó reducida a receptionGroup/onReceptionGroupChange.
  AgendaServiceButtons: ({
    receptionGroup,
    onReceptionGroupChange,
  }: {
    receptionGroup?: string | null
    onReceptionGroupChange?: (group: string | null) => void
  }) => (
    <div
      data-testid="agenda-service-buttons"
      data-reception-group={receptionGroup ?? ''}
    >
      {/* Botones stub de los 3 botones de grupo (Fisioterapia/Pileta/Pilates) */}
      <button onClick={() => onReceptionGroupChange?.('fisioterapia')}>mock-pick-grupo-fisio</button>
      <button onClick={() => onReceptionGroupChange?.(null)}>mock-clear-grupo</button>
    </div>
  ),
}))

import { AgendaView as AgendaPage } from './AgendaView'
import { useUserRole } from '@/hooks/use-user-role'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'
import { useWalkInService } from '@/hooks/use-walk-in-service'

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
    vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: false, isError: false, refetch: vi.fn() })
    vi.mocked(useWalkInService).mockReturnValue(null)
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

  // ─── Atajo "Dar un turno" desde una celda vacía (pedido ISADI 2026-07-14) ───
  // Reemplaza el flujo de "click en hueco libre" (retirado junto con los huecos
  // del calendario): AgendaView ya no consulta disponibilidad para pintar la
  // grilla, así que el prefill del NewTurnoModal se arma solo con fecha/hora
  // (+ profesional cuando la vista Día ya lo identifica).
  describe('atajo "Dar un turno" desde celda vacía', () => {
    it('vista día: click en la celda vacía abre NewTurnoModal con fecha/hora/profesional prellenados', async () => {
      mockSearchParamsData = { vista: 'dia' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-empty-cell-dia' }))
      const modal = await screen.findByTestId('new-turno-modal')
      expect(modal).toHaveAttribute('data-date', '2026-07-14')
      expect(modal).toHaveAttribute('data-time', '10:00')
      expect(modal).toHaveAttribute('data-prof', 'prof-9')
    })

    it('vista semana: click en la celda vacía abre NewTurnoModal con fecha/hora prellenados', async () => {
      mockSearchParamsData = {}
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-empty-cell-semana' }))
      const modal = await screen.findByTestId('new-turno-modal')
      expect(modal).toHaveAttribute('data-date', '2026-07-15')
      expect(modal).toHaveAttribute('data-time', '11:00')
    })
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

  it('al hacer click en "+ Nuevo paquete" abre el NewPaqueteModal (sin initialPatient)', async () => {
    // Admin ve "Nuevo paquete" siempre visible (agenda completa).
    vi.mocked(useUserRole).mockReturnValue('admin')
    mockSearchParamsData = { vista: 'dia' }
    render(<AgendaPage />)
    fireEvent.click(screen.getByRole('button', { name: /nuevo paquete/i }))
    expect(await screen.findByTestId('new-paquete-modal')).toBeInTheDocument()
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

    it('receptionist: por defecto NO muestra AgendaFilters (profesional/área), pero sí selector de vista, "Dar turno" y "Filtrar"', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
      // Pedido 3 (ISADI 2026-07-16): el selector de vista (Día/Semana/Mes) ya
      // NO vive detrás de "Filtrar" — visible siempre, mismo criterio que
      // AgendaServiceButtons (pedido 2026-07-14).
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /nuevo paquete/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /dar turno/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^filtrar$/i })).toBeInTheDocument()
    })

    it('receptionist: al hacer click en "Filtrar" se revelan AgendaFilters y "Nuevo paquete" (el selector de vista ya estaba visible)', () => {
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

  // ── Foco de área (Rehabilitación) — sin toggle ─────────────────────────────
  // El toggle "Rehabilitación | Ver todo" se retiró (decisión ISADI dueño
  // 2026-07-16 — la agenda es 100% modo grupos). El foco ya no es una
  // constante interna: se deriva de `tenants.rules.agenda_area_focus` vía
  // useTenantConfig (ver describe de abajo). Acá solo verificamos que el rol
  // 'doctor' sigue sin ver filtros de agenda (igual que antes).
  describe('Foco de área (Rehabilitación) — sin toggle', () => {
    it('doctor: no ve filtros de agenda (showFilters = admin || receptionist)', () => {
      vi.mocked(useUserRole).mockReturnValue('doctor')
      render(<AgendaPage />)
      expect(screen.queryByTestId('agenda-service-buttons')).not.toBeInTheDocument()
      expect(screen.queryByTestId('agenda-filters')).not.toBeInTheDocument()
    })
  })

  // ── Foco de área por tenant (tenants.rules.agenda_area_focus, migr 062) ────
  // Antes `areaFocus` estaba fijo en 'rehab' para TODOS los tenants: cualquier
  // cuenta sin servicios de rehabilitación (nombre que no matchea
  // isRehabService) veía la agenda completamente vacía. Ahora depende de la
  // config del tenant (useTenantConfig → agendaAreaFocus).
  describe('Foco de área por tenant (agenda_area_focus)', () => {
    it('tenant SIN agenda_area_focus + servicio no-rehab → el turno se ve (reproduce el bug original)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
          { appointment_id: 'a2', services: { name: 'Sesión de Psicología', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view')).toHaveAttribute('data-appt-count', '2')
    })

    it('tenant con agenda_area_focus="rehab" (ISADI) → recorta a servicios de rehabilitación (igual que hoy)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: 'rehab', receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Kinesiología', reception_group: 'fisioterapia' } },
          { appointment_id: 'a2', services: { name: 'Consulta General', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view')).toHaveAttribute('data-appt-count', '1')
      // Medium (3ª ronda de code review): KPIStrip debe recibir los MISMOS
      // turnos recortados que la grilla (focusedAppointments), no los turnos
      // sin recortar — si alguien revierte `appointments={focusedAppointments}`
      // por `appointments={appointments}` en AgendaView, este assert lo detecta.
      expect(screen.getByTestId('kpi-strip')).toHaveAttribute('data-appt-count', '1')
    })

    // Rol receptionist: mismo mecanismo de recorte que admin (AreaFocus no
    // depende del rol) — se confirma acá explícitamente porque ISADI opera
    // sobre todo desde recepción.
    it('receptionist + tenant con agenda_area_focus="rehab" → recorta a servicios de rehabilitación', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: 'rehab', receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Fisioterapia', reception_group: 'fisioterapia' } },
          { appointment_id: 'a2', services: { name: 'Consulta General', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view')).toHaveAttribute('data-appt-count', '1')
    })

    // Corrección de code review (High 1): antes, mientras la config del
    // tenant cargaba, `areaFocus` caía a 'todos' y la grilla mostraba los
    // turnos SIN recortar por un instante (trade-off aceptado por el dueño en
    // la primera pasada). Ese criterio quedó REEMPLAZADO: ISADI no debe ver
    // la grilla sin recortar ni un instante, así que ahora `tenantConfigPending`
    // combinado con el loading de turnos hace que CalendarView muestre su
    // skeleton habitual — NINGÚN turno (ni recortado ni sin recortar) se
    // pinta hasta que la config resolvió.
    it('mientras la config del tenant está pendiente → se ve el skeleton de carga, no se pinta ningún turno', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: true,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
          { appointment_id: 'a2', services: { name: 'Kinesiología', reception_group: 'fisioterapia' } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-skeleton')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
      expect(screen.queryByText(/consulta general/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/kinesiología/i)).not.toBeInTheDocument()
      // Medium (3ª ronda de code review): KPIStrip también debe quedar en su
      // estado de carga — si `isLoading={combinedIsLoading}` se revirtiera a
      // `isLoading={isLoading}` (turnos, sin la config), los indicadores se
      // calcularían con turnos SIN recortar mientras la config todavía carga.
      expect(screen.getByTestId('kpi-strip-skeleton')).toBeInTheDocument()
      expect(screen.queryByTestId('kpi-strip')).not.toBeInTheDocument()
    })

    // Corrección de code review (High 2): un error persistente de
    // /api/tenant/config ya NO degrada en silencio a "sin recorte" (dejaba a
    // ISADI toda la sesión sin recortar y sin aviso). Ahora se propaga como el
    // estado de error+reintento que CalendarView ya usa para el error de
    // turnos — ningún turno se pinta, y "Reintentar" vuelve a pedir turnos Y
    // config (refetchTenantConfig).
    it('config del tenant en error → muestra el estado de error, no pinta turnos, y el reintento repide la config', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      const mockRefetchTenantConfig = vi.fn()
      const mockRefetchAppointments = vi.fn()
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: true,
        refetch: mockRefetchTenantConfig,
      })
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: mockRefetchAppointments,
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-error')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
      expect(screen.queryByText(/consulta general/i)).not.toBeInTheDocument()
      // Medium (3ª ronda de code review): KPIStrip también debe quedar en su
      // estado de error — si `isError={combinedIsError}` se revirtiera a
      // `isError={isError}` (turnos, sin la config), los indicadores se
      // calcularían con turnos SIN recortar mientras la config está en error.
      expect(screen.getByTestId('kpi-strip-error')).toBeInTheDocument()
      expect(screen.queryByTestId('kpi-strip')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'mock-reintentar' }))
      expect(mockRefetchAppointments).toHaveBeenCalledOnce()
      expect(mockRefetchTenantConfig).toHaveBeenCalledOnce()
    })
  })

  // ── Corrección de code review (2ª ronda, High 2) — mismo gateo en vista
  // Semana/Mes (rango) ────────────────────────────────────────────────────────
  // La descripción anterior solo probaba la vista Día (?vista=dia). La vista
  // Semana es el DEFAULT (sin ?vista en la URL) — la que ve cualquiera que
  // abra /agenda "en frío" — y usaba un mock de CalendarViewRangeReadOnly que
  // ignoraba isLoading/isError/onRefetch, así que un bug en
  // combinedRangeIsLoading/combinedRangeIsError o un olvido al pasar la prop
  // no hacía fallar ningún test. Estos tests son el equivalente, en rango, de
  // los cuatro de arriba (recorte sin regla / con 'rehab' / pendiente / error).
  describe('Foco de área y loading/error combinados en vista Semana/Mes (rango, default)', () => {
    it('vista Semana (default): tenant SIN agenda_area_focus + servicio no-rehab → el turno se ve', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointmentsRange).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
          { appointment_id: 'a2', services: { name: 'Sesión de Psicología', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useAppointmentsRange>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-range')).toHaveAttribute('data-appt-count', '2')
    })

    it('vista Semana (default): tenant con agenda_area_focus="rehab" (ISADI) → recorta a servicios de rehabilitación', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: 'rehab', receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointmentsRange).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Kinesiología', reception_group: 'fisioterapia' } },
          { appointment_id: 'a2', services: { name: 'Consulta General', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useAppointmentsRange>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-range')).toHaveAttribute('data-appt-count', '1')
    })

    it('vista Semana (default): mientras la config del tenant está pendiente → se ve el skeleton, no se pinta ningún turno', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: true,
        isError: false,
        refetch: vi.fn(),
      })
      vi.mocked(useAppointmentsRange).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
          { appointment_id: 'a2', services: { name: 'Kinesiología', reception_group: 'fisioterapia' } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useAppointmentsRange>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-range-skeleton')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view-range')).not.toBeInTheDocument()
      expect(screen.queryByText(/consulta general/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/kinesiología/i)).not.toBeInTheDocument()
    })

    it('vista Semana (default): config del tenant en error → muestra el estado de error, no pinta turnos, y el reintento pide turnos Y config', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = {}
      const mockRefetchTenantConfig = vi.fn()
      const mockRangeRefetch = vi.fn()
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: true,
        refetch: mockRefetchTenantConfig,
      })
      vi.mocked(useAppointmentsRange).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Consulta General', reception_group: null } },
        ],
        isLoading: false,
        isError: false,
        refetch: mockRangeRefetch,
      } as unknown as ReturnType<typeof useAppointmentsRange>)
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-range-error')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view-range')).not.toBeInTheDocument()
      expect(screen.queryByText(/consulta general/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'mock-reintentar-semana' }))
      expect(mockRangeRefetch).toHaveBeenCalledOnce()
      expect(mockRefetchTenantConfig).toHaveBeenCalledOnce()
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
  // El control de servicio individual se retiró (la agenda es 100% modo grupos,
  // decisión ISADI 2026-07-16), así que ya no hay UI que setee service_id. El
  // handler de profesional conserva la exclusión: elegir profesional limpia
  // cualquier service_id residual en la URL.
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
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: false, isError: false, refetch: vi.fn() })
      render(<AgendaPage />)
      expect(screen.getByTestId('sync-status-banner')).toBeInTheDocument()
      expect(screen.getByTestId('gcal-degradation-banner')).toBeInTheDocument()
    })

    it('NO muestra banners GCal cuando usesNativeCalendar=true', () => {
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: true, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: false, isError: false, refetch: vi.fn() })
      render(<AgendaPage />)
      expect(screen.queryByTestId('sync-status-banner')).not.toBeInTheDocument()
      expect(screen.queryByTestId('gcal-degradation-banner')).not.toBeInTheDocument()
    })

    it('cuando usesNativeCalendar=true, useGCalChannelStatus se llama con enabled=false', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: true, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: false, isError: false, refetch: vi.fn() })
      render(<AgendaPage />)
      expect(vi.mocked(useGCalChannelStatus)).toHaveBeenCalledWith(false)
    })

    it('cuando tenantConfig está pendiente (isPending=true), useGCalChannelStatus se llama con enabled=false', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({ usesNativeCalendar: false, agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null, isPending: true, isError: false, refetch: vi.fn() })
      render(<AgendaPage />)
      expect(vi.mocked(useGCalChannelStatus)).toHaveBeenCalledWith(false)
    })

    // ── Corrección de code review (2ª ronda, High 1) ──────────────────────────
    // Antes, `!tenantConfigPending && !usesNativeCalendar` NO consideraba el
    // error de la config: si /api/tenant/config fallaba tras agotar
    // reintentos, `isPending` pasaba a false y `usesNativeCalendar` caía a su
    // fallback `false`, así que la condición daba `true` — el banner de sync
    // se rendería con `focusedAppointments` SIN recortar (porque
    // `configAreaFocus` es null con la config en error ⇒ `areaFocus` =
    // 'todos'), mientras la grilla de al lado mostraba "Error al cargar". El
    // "caso de control" (config OK, config OK, `usesNativeCalendar=false`) ya
    // está cubierto arriba ("muestra banners GCal cuando usesNativeCalendar
    // =false y vista día"); acá se prueba el caso que faltaba: config en
    // error (con el fallback de usesNativeCalendar a false) NO debe mostrar
    // los banners.
    it('config del tenant en error (con usesNativeCalendar=false por fallback) → NO muestra banners GCal', () => {
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: true,
        refetch: vi.fn(),
      })
      render(<AgendaPage />)
      expect(screen.queryByTestId('sync-status-banner')).not.toBeInTheDocument()
      expect(screen.queryByTestId('gcal-degradation-banner')).not.toBeInTheDocument()
    })

    it('cuando la config del tenant está en error, useGCalChannelStatus se llama con enabled=false', () => {
      mockSearchParamsData = {}
      vi.mocked(useTenantConfig).mockReturnValue({
        usesNativeCalendar: false,
        agendaAreaFocus: null, receptionGroups: {}, receptionDefaultGroup: null,
        isPending: false,
        isError: true,
        refetch: vi.fn(),
      })
      render(<AgendaPage />)
      expect(vi.mocked(useGCalChannelStatus)).toHaveBeenCalledWith(false)
    })
  })

  // ── Pedido 1 (ISADI 2026-07-16) — NewTurnoModal recibe isReceptionist ──────
  describe('Pedido 1 — isReceptionist se propaga a NewTurnoModal', () => {
    it('receptionist: NewTurnoModal recibe isReceptionist=true', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: /dar turno/i }))
      expect(screen.getByTestId('new-turno-modal')).toHaveAttribute('data-is-receptionist', 'true')
    })

    it('admin: NewTurnoModal recibe isReceptionist=false (modal queda igual que hoy)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: /nuevo turno/i }))
      expect(screen.getByTestId('new-turno-modal')).toHaveAttribute('data-is-receptionist', 'false')
    })
  })

  // ── Grupo (Fisioterapia/Pileta/Pilates) — TODOS los roles (ISADI 2026-07-16) ─
  // La agenda muestra los 3 botones de GRUPO para admin Y recepción ("igual que
  // recepción"). El grupo es estado local (no URL) y filtra los turnos
  // client-side para todos los roles (antes solo aplicaba a receptionist).
  describe('Grupo (Fisioterapia/Pileta/Pilates) — todos los roles', () => {
    it('receptionist: AgendaServiceButtons visible con receptionGroup=null por defecto', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute('data-reception-group', '')
    })

    it('admin: AgendaServiceButtons visible con receptionGroup=null por defecto (mismos 3 grupos que recepción)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute('data-reception-group', '')
    })

    it('receptionist: click en un botón de grupo actualiza receptionGroup (estado local, no URL)', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
      // No navega — no es un filtro de URL como service_id/professional_id.
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it('admin: click en un botón de grupo actualiza receptionGroup (estado local, no URL)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it('receptionist: click de nuevo limpia el grupo (vuelve a null)', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      fireEvent.click(screen.getByRole('button', { name: 'mock-clear-grupo' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute('data-reception-group', '')
    })

    it('admin: seleccionar un grupo filtra la agenda CLIENT-SIDE (los turnos de otro grupo se ocultan)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { vista: 'dia' }
      vi.mocked(useAppointments).mockReturnValue({
        appointments: [
          { appointment_id: 'a1', services: { name: 'Kinesiología', reception_group: 'fisioterapia' } },
          { appointment_id: 'a2', services: { name: 'Pilates', reception_group: 'pilates' } },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        overtime: {},
      } as unknown as ReturnType<typeof useAppointments>)
      render(<AgendaPage />)
      // Con un grupo elegido, applyReceptionGroupFilter=true (y el recorte por
      // nombre 'rehab' se apaga porque hay grupo): quedan solo los turnos del
      // grupo. ANTES del cambio, este filtro NO aplicaba a admin.
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('calendar-view')).toHaveAttribute('data-appt-count', '1')
    })

    it('admin: "Limpiar" resetea el grupo elegido', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
      fireEvent.click(screen.getByRole('button', { name: 'mock-limpiar' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute('data-reception-group', '')
    })
  })

  // ── Deuda B4 — filtros de recepción intersectados ──────────────────────────
  // Cambiar (o limpiar) el grupo de recepción es una selección más gruesa que
  // service_id/professional_id: si alguno de esos dos quedó residual en la
  // URL, debe limpiarse en el mismo push para que el grupo activo y el
  // service_id/profesional nunca se contradigan (agenda vacía + filtro
  // visual engañoso).
  describe('Deuda B4 — unificación de transiciones receptionGroup ⊕ service_id/professional_id', () => {
    it('elegir un grupo SIN residuo en la URL no navega (comportamiento previo intacto)', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      mockSearchParamsData = {}
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(mockRouterPush).not.toHaveBeenCalled()
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
    })

    it('elegir un grupo con professional_id residual en la URL lo limpia en un único push', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      mockSearchParamsData = { professional_id: 'prof-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(mockRouterPush).toHaveBeenCalledOnce()
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).not.toContain('professional_id')
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
    })

    it('elegir un grupo con service_id residual en la URL lo limpia en un único push', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      mockSearchParamsData = { service_id: 'svc-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(mockRouterPush).toHaveBeenCalledOnce()
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).not.toContain('service_id')
    })

    it('limpiar el grupo (deseleccionar) con professional_id residual también lo limpia', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      mockSearchParamsData = { professional_id: 'prof-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-clear-grupo' }))
      expect(mockRouterPush).toHaveBeenCalledOnce()
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).not.toContain('professional_id')
    })

    it('"Limpiar" (AgendaFilters) resetea también el grupo de recepción — sin residuo', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      // Abrir "Filtrar" para revelar AgendaFilters (modo turnero: plegado por defecto).
      fireEvent.click(screen.getByRole('button', { name: /^filtrar$/i }))
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute(
        'data-reception-group',
        'fisioterapia',
      )
      fireEvent.click(screen.getByRole('button', { name: 'mock-limpiar' }))
      expect(screen.getByTestId('agenda-service-buttons')).toHaveAttribute('data-reception-group', '')
    })

    it('admin: "Limpiar" sigue funcionando igual que antes (receptionGroup no le aplica)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      mockSearchParamsData = { professional_id: 'prof-1' }
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: 'mock-limpiar' }))
      const url = mockRouterPush.mock.calls.at(-1)![0] as string
      expect(url).not.toContain('professional_id')
      expect(url).not.toContain('service_id')
    })

    // Deuda detectada Frente B — AgendaFilters no recibía el estado del grupo
    // de recepción, así que su "Limpiar" quedaba deshabilitado cuando el
    // ÚNICO filtro activo era el grupo. AgendaView debe pasarle
    // `hasReceptionGroup` derivado de `receptionGroup` para que "Limpiar" se
    // habilite en ese caso.
    it('receptionist: AgendaFilters recibe hasReceptionGroup=false por defecto (sin grupo activo)', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: /^filtrar$/i }))
      expect(screen.getByTestId('agenda-filters')).toHaveAttribute('data-has-reception-group', 'false')
    })

    it('receptionist: al elegir un grupo, AgendaFilters recibe hasReceptionGroup=true', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: /^filtrar$/i }))
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-filters')).toHaveAttribute('data-has-reception-group', 'true')
    })

    it('receptionist: "Limpiar" con SOLO el grupo activo también deja hasReceptionGroup=false después del click', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      fireEvent.click(screen.getByRole('button', { name: /^filtrar$/i }))
      fireEvent.click(screen.getByRole('button', { name: 'mock-pick-grupo-fisio' }))
      expect(screen.getByTestId('agenda-filters')).toHaveAttribute('data-has-reception-group', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'mock-limpiar' }))
      expect(screen.getByTestId('agenda-filters')).toHaveAttribute('data-has-reception-group', 'false')
    })

    it('admin: AgendaFilters recibe hasReceptionGroup=false siempre (receptionGroup no le aplica)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      expect(screen.getByTestId('agenda-filters')).toHaveAttribute('data-has-reception-group', 'false')
    })
  })

  // ── Pedido 3 (ISADI 2026-07-16) — selector de vista siempre visible ────────
  describe('Pedido 3 — CalendarViewSelector visible sin abrir "Filtrar"', () => {
    it('receptionist: el selector de vista ya está visible en el primer render (sin tocar "Filtrar")', () => {
      vi.mocked(useUserRole).mockReturnValue('receptionist')
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
      // "Filtrar" sigue cerrado — Pedido 3 no cambia ese estado, solo saca el
      // selector de vista de detrás de él.
      expect(screen.getByRole('button', { name: /^filtrar$/i })).toHaveAttribute('aria-expanded', 'false')
    })

    it('admin: sin cambios — el selector de vista sigue visible (no había gate)', () => {
      vi.mocked(useUserRole).mockReturnValue('admin')
      render(<AgendaPage />)
      expect(screen.getByTestId('calendar-view-selector')).toBeInTheDocument()
    })
  })

  // ─── Feriados + estado del día (pedido ISADI 2026-07-14) ───────────────────
  describe('estado del día — modal "¿abre o no?"', () => {
    it('el modal arranca cerrado (sin click en ningún badge)', () => {
      render(<AgendaPage />)
      expect(screen.queryByTestId('day-status-modal')).not.toBeInTheDocument()
    })

    it('click en el badge de estado del día (vía CalendarViewRangeReadOnly) abre el modal', async () => {
      render(<AgendaPage />)
      fireEvent.click(screen.getByText('mock-day-status-click'))
      expect(await screen.findByTestId('day-status-modal')).toBeInTheDocument()
    })
  })

  // ── Story 16.2 — cola de orden de llegada montada en la vista Día ───────────
  // El objetivo de estos tests es el GATING de montaje del panel (no el panel en
  // sí, que se testea en ColaOrdenLlegada.test.tsx). Se mockea useWalkInService
  // (resolver) y ColaOrdenLlegada (stub). Ojo: sin `fecha` en la URL,
  // selectedDate = hoy → `hoy` es true por defecto.
  describe('Story 16.2 — panel ColaOrdenLlegada (gating en vista Día)', () => {
    const walkInResolved = {
      serviceId: 'svc-walkin',
      professionalIds: ['prof-walkin'],
      defaultProfessionalId: 'prof-walkin',
    }

    it('vista Día + HOY + professional_id que atiende walk-in → monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'dia', professional_id: 'prof-walkin' }
      render(<AgendaPage />)
      const panel = screen.getByTestId('cola-orden-llegada')
      expect(panel).toBeInTheDocument()
      expect(panel).toHaveAttribute('data-service-id', 'svc-walkin')
      expect(panel).toHaveAttribute('data-professional-id', 'prof-walkin')
    })

    it('vista Día + service_id del walk-in (sin professional_id) → monta con el profesional por defecto', () => {
      vi.mocked(useWalkInService).mockReturnValue({
        serviceId: 'svc-walkin',
        professionalIds: ['prof-a', 'prof-b'],
        defaultProfessionalId: 'prof-a',
      })
      mockSearchParamsData = { vista: 'dia', service_id: 'svc-walkin' }
      render(<AgendaPage />)
      const panel = screen.getByTestId('cola-orden-llegada')
      expect(panel).toBeInTheDocument()
      expect(panel).toHaveAttribute('data-professional-id', 'prof-a')
    })

    it('(a) fecha ≠ hoy → NO monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'dia', professional_id: 'prof-walkin', fecha: '2020-01-01' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('(b) professional_id que NO atiende walk-in → NO monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'dia', professional_id: 'prof-otro' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('(c) useWalkInService() = null (tenant sin cola) → NO monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(null)
      mockSearchParamsData = { vista: 'dia', professional_id: 'prof-walkin' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('(d) vista Semana → NO monta el panel (la cola es de un día puntual)', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'semana', professional_id: 'prof-walkin' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('(d) vista Mes → NO monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'mes', professional_id: 'prof-walkin' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('(e) sin filtro (todos los profesionales) → NO monta el panel', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      mockSearchParamsData = { vista: 'dia' }
      render(<AgendaPage />)
      expect(screen.queryByTestId('cola-orden-llegada')).not.toBeInTheDocument()
    })

    it('el panel recibe hoyISO = fecha ISO local de la vista (hoy)', () => {
      vi.mocked(useWalkInService).mockReturnValue(walkInResolved)
      // Fecha LOCAL (igual que formatISO(..., { representation: 'date' }) en
      // AgendaView) — no UTC, para no desfasar el día por timezone.
      const now = new Date()
      const hoyISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      mockSearchParamsData = { vista: 'dia', professional_id: 'prof-walkin' }
      render(<AgendaPage />)
      expect(screen.getByTestId('cola-orden-llegada')).toHaveAttribute('data-hoy-iso', hoyISO)
    })
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FiltroFechasMetricas } from './FiltroFechasMetricas'
import * as dateFnsTz from 'date-fns-tz'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn((d: Date) => d),
  formatInTimeZone: vi.fn().mockReturnValue('2026-05-01T00:00:00-03:00'),
}))

vi.mock('date-fns', () => ({
  startOfMonth: vi.fn((d: Date) => d),
  subDays: vi.fn((d: Date) => d),
  startOfDay: vi.fn((d: Date) => d),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultProps = {
  periodoDesde: '2026-05-01T00:00:00-03:00',
  periodoHasta: '2026-05-13T23:59:59-03:00',
  esRangoPorDefecto: true,
  onAplicar: vi.fn(),
  onLimpiar: vi.fn(),
}

function renderFiltro(overrides?: Partial<typeof defaultProps>) {
  const props = { ...defaultProps, onAplicar: vi.fn(), onLimpiar: vi.fn(), ...overrides }
  return { ...render(<FiltroFechasMetricas {...props} />), props }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FiltroFechasMetricas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Renderizado ────────────────────────────────────────────────────────────

  it('renderiza el selector de período', () => {
    renderFiltro()
    expect(screen.getByLabelText('Seleccionar período')).toBeInTheDocument()
  })

  it('muestra "Este mes" como opción seleccionada por defecto cuando esRangoPorDefecto=true', () => {
    renderFiltro({ esRangoPorDefecto: true })
    const select = screen.getByLabelText('Seleccionar período') as HTMLSelectElement
    expect(select.value).toBe('este-mes')
  })

  it('no muestra inputs de fecha cuando el período no es "Personalizado"', () => {
    renderFiltro({ esRangoPorDefecto: true })
    expect(screen.queryByLabelText('Fecha desde')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha hasta')).not.toBeInTheDocument()
  })

  it('muestra inputs de fecha y botón Aplicar cuando se selecciona "Personalizado"', () => {
    renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    expect(screen.getByLabelText('Fecha desde')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha hasta')).toBeInTheDocument()
    expect(screen.getByLabelText('Aplicar filtro de fechas')).toBeInTheDocument()
  })

  // ── Períodos predefinidos ──────────────────────────────────────────────────

  it('llama onAplicar inmediatamente al seleccionar "Últimos 7 días"', () => {
    const { props } = renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'ultimos-7' } })

    expect(props.onAplicar).toHaveBeenCalledOnce()
    expect(props.onAplicar).toHaveBeenCalledWith(expect.any(String), expect.any(String))
  })

  it('llama onAplicar inmediatamente al seleccionar "Últimos 30 días"', () => {
    const { props } = renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'ultimos-30' } })

    expect(props.onAplicar).toHaveBeenCalledOnce()
  })

  it('llama onAplicar inmediatamente al seleccionar "Último trimestre"', () => {
    const { props } = renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'ultimo-trimestre' } })

    expect(props.onAplicar).toHaveBeenCalledOnce()
  })

  it('llama onAplicar inmediatamente al seleccionar "Este mes"', () => {
    // Primero cambiar a personalizado, luego volver a este-mes
    const { props } = renderFiltro({ esRangoPorDefecto: false })
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'este-mes' } })

    expect(props.onAplicar).toHaveBeenCalledOnce()
  })

  // ── Modo personalizado ─────────────────────────────────────────────────────

  it('muestra error inline si inicio > fin al hacer click en Aplicar', () => {
    renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    const inputDesde = screen.getByLabelText('Fecha desde')
    const inputHasta = screen.getByLabelText('Fecha hasta')
    fireEvent.change(inputDesde, { target: { value: '2026-05-13' } })
    fireEvent.change(inputHasta, { target: { value: '2026-05-01' } })

    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toContain('La fecha de inicio no puede ser posterior')
  })

  it('muestra error si faltan ambas fechas al hacer click en Aplicar', () => {
    renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toContain('Seleccioná ambas fechas')
  })

  it('NO llama onAplicar si la validación falla (inicio > fin)', () => {
    const { props } = renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    const inputDesde = screen.getByLabelText('Fecha desde')
    const inputHasta = screen.getByLabelText('Fecha hasta')
    fireEvent.change(inputDesde, { target: { value: '2026-05-13' } })
    fireEvent.change(inputHasta, { target: { value: '2026-05-01' } })

    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))

    expect(props.onAplicar).not.toHaveBeenCalled()
  })

  it('llama onAplicar con ISO 8601 con timezone explícita cuando el rango es válido', () => {
    // El mock de formatInTimeZone retorna '2026-05-01T00:00:00-03:00'
    // Verificamos que onAplicar recibe ese valor (confirma que pasa por toISO → formatInTimeZone con TZ)
    const formatInTimeZone = vi.mocked(dateFnsTz.formatInTimeZone)
    const { props } = renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    const inputDesde = screen.getByLabelText('Fecha desde')
    const inputHasta = screen.getByLabelText('Fecha hasta')
    fireEvent.change(inputDesde, { target: { value: '2026-05-01' } })
    fireEvent.change(inputHasta, { target: { value: '2026-05-13' } })

    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))

    expect(props.onAplicar).toHaveBeenCalledOnce()
    // Los valores vienen de formatInTimeZone (mockeado) → confirma que se usa toISO con timezone explícita
    const [desde, hasta] = props.onAplicar.mock.calls[0] as [string, string]
    expect(desde).toBe('2026-05-01T00:00:00-03:00')
    expect(hasta).toBe('2026-05-01T00:00:00-03:00')
    expect(formatInTimeZone).toHaveBeenCalled()
  })

  it('limpia el error al cambiar las fechas', () => {
    renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    // Generar error
    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Cambiar una fecha limpia el error
    const inputDesde = screen.getByLabelText('Fecha desde')
    fireEvent.change(inputDesde, { target: { value: '2026-05-01' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ── Botón Limpiar ──────────────────────────────────────────────────────────

  it('no muestra botón Limpiar cuando esRangoPorDefecto=true', () => {
    renderFiltro({ esRangoPorDefecto: true })
    expect(screen.queryByLabelText('Limpiar filtros y volver al período por defecto')).not.toBeInTheDocument()
  })

  it('muestra botón Limpiar cuando esRangoPorDefecto=false', () => {
    renderFiltro({ esRangoPorDefecto: false })
    expect(screen.getByLabelText('Limpiar filtros y volver al período por defecto')).toBeInTheDocument()
  })

  it('llama onLimpiar al hacer click en el botón Limpiar', () => {
    const { props } = renderFiltro({ esRangoPorDefecto: false })
    fireEvent.click(screen.getByLabelText('Limpiar filtros y volver al período por defecto'))
    expect(props.onLimpiar).toHaveBeenCalledOnce()
  })

  // ── Accesibilidad ──────────────────────────────────────────────────────────

  it('tiene role="search" y aria-label="Filtro de período de métricas"', () => {
    renderFiltro()
    expect(screen.getByRole('search', { name: 'Filtro de período de métricas' })).toBeInTheDocument()
  })

  it('errores se anuncian con role="alert"', () => {
    renderFiltro()
    const select = screen.getByLabelText('Seleccionar período')
    fireEvent.change(select, { target: { value: 'personalizado' } })

    fireEvent.click(screen.getByLabelText('Aplicar filtro de fechas'))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

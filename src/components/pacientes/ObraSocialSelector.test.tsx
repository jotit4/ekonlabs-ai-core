import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Variables hoisted para controlar el estado del mock de useQuery
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mockUseQuery,
}))

import { ObraSocialSelector } from './ObraSocialSelector'

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const mockEntidades = [
  { entidad: 'OSEP', planes: ['Plan 100', 'Plan 200', 'Plan 300'] },
  { entidad: 'PAMI', planes: ['Plan PAMI'] },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ObraSocialSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: datos cargados correctamente
    mockUseQuery.mockReturnValue({
      data: { entidades: mockEntidades },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
  })

  it('renderiza dos selects cuando los datos están disponibles', () => {
    render(<ObraSocialSelector value={null} onChange={vi.fn()} />)

    const obraSocialSelect = screen.getByRole('combobox', { name: /obra social/i })
    const planSelect = screen.getByRole('combobox', { name: /plan de cobertura/i })
    expect(obraSocialSelect).toBeInTheDocument()
    expect(planSelect).toBeInTheDocument()
  })

  it('primer select cargado con las entidades del mock', () => {
    render(<ObraSocialSelector value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'OSEP' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'PAMI' })).toBeInTheDocument()
  })

  it('al seleccionar entidad → segundo select muestra planes de esa entidad', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ObraSocialSelector value={null} onChange={onChange} />)

    // Seleccionar OSEP
    const obraSocialSelect = screen.getByRole('combobox', { name: /obra social/i })
    await user.selectOptions(obraSocialSelect, 'OSEP')

    expect(onChange).toHaveBeenCalledWith({ entidad: 'OSEP', plan: '' })
  })

  it('al cambiar entidad → plan se limpia (onChange llamado con plan vacío)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    // Estado inicial: OSEP con Plan 100 seleccionado
    const { rerender } = render(
      <ObraSocialSelector
        value={{ entidad: 'OSEP', plan: 'Plan 100' }}
        onChange={onChange}
      />
    )

    // Verificar que los planes de OSEP están disponibles
    expect(screen.getByRole('option', { name: 'Plan 100' })).toBeInTheDocument()

    // Cambiar a PAMI
    const obraSocialSelect = screen.getByRole('combobox', { name: /obra social/i })
    await user.selectOptions(obraSocialSelect, 'PAMI')

    // onChange debe haber sido llamado con plan vacío (limpieza del plan anterior)
    expect(onChange).toHaveBeenCalledWith({ entidad: 'PAMI', plan: '' })

    // Simular que el padre actualizó el value a PAMI con plan vacío
    rerender(
      <ObraSocialSelector
        value={{ entidad: 'PAMI', plan: '' }}
        onChange={onChange}
      />
    )

    // Los planes de PAMI deben mostrarse, no los de OSEP
    expect(screen.queryByRole('option', { name: 'Plan 100' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Plan PAMI' })).toBeInTheDocument()
  })

  it('entidad sin planes activos → muestra "No hay planes activos para esta obra social"', () => {
    mockUseQuery.mockReturnValue({
      data: { entidades: [{ entidad: 'EntidadSinPlanes', planes: [] }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(
      <ObraSocialSelector
        value={{ entidad: 'EntidadSinPlanes', plan: '' }}
        onChange={vi.fn()}
      />
    )

    expect(
      screen.getByText('No hay planes activos para esta obra social')
    ).toBeInTheDocument()
    // El segundo select NO debe estar presente
    expect(screen.queryByRole('combobox', { name: /plan de cobertura/i })).not.toBeInTheDocument()
  })

  it('estado loading → selects deshabilitados con texto "Cargando..."', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ObraSocialSelector value={null} onChange={vi.fn()} />)

    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    selects.forEach(select => {
      expect(select).toBeDisabled()
    })
    // Ambos selects tienen "Cargando..."
    const loadingOptions = screen.getAllByText('Cargando...')
    expect(loadingOptions).toHaveLength(2)
  })

  it('estado error → muestra mensaje de error con botón Reintentar', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    })

    render(<ObraSocialSelector value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/error al cargar obras sociales/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('botón Reintentar llama refetch', async () => {
    const mockRefetch = vi.fn()
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: mockRefetch,
    })

    const user = userEvent.setup()
    render(<ObraSocialSelector value={null} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('al seleccionar plan → onChange llamado con entidad y plan seleccionado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ObraSocialSelector
        value={{ entidad: 'OSEP', plan: '' }}
        onChange={onChange}
      />
    )

    const planSelect = screen.getByRole('combobox', { name: /plan de cobertura/i })
    await user.selectOptions(planSelect, 'Plan 200')

    expect(onChange).toHaveBeenCalledWith({ entidad: 'OSEP', plan: 'Plan 200' })
  })
})

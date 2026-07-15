import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditFilters } from './AuditFilters'
import type { AuditFilters as AuditFiltersType } from '@/types/audit'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUsers = [
  { user_id: 'user-uuid-1', full_name: 'Ana García', is_active: true },
  { user_id: 'user-uuid-2', full_name: 'Carlos López', is_active: false },
]

const emptyFilters: AuditFiltersType = {}
const filtersWithAction: AuditFiltersType = { action: 'patient_deleted' }
const filtersWithUser: AuditFiltersType = { userId: 'user-uuid-1' }
const filtersWithDate: AuditFiltersType = { dateFrom: '2026-01-01' }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditFilters', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onFiltersChange: ReturnType<typeof vi.fn> & ((f: AuditFiltersType) => void)

  beforeEach(() => {
    vi.clearAllMocks()
    onFiltersChange = vi.fn() as ReturnType<typeof vi.fn> & ((f: AuditFiltersType) => void)
  })

  it('renderiza los cuatro controles con aria-label correcto', () => {
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.getByRole('combobox', { name: /filtrar por acción/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por usuario/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha desde/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha hasta/i)).toBeInTheDocument()
  })

  it('botón "Limpiar filtros" no visible cuando filters está vacío', () => {
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.queryByRole('button', { name: /limpiar filtros/i })).not.toBeInTheDocument()
  })

  it('botón "Limpiar filtros" visible cuando al menos un filtro está activo (action)', () => {
    render(
      <AuditFilters
        filters={filtersWithAction}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.getByRole('button', { name: /limpiar filtros/i })).toBeInTheDocument()
  })

  it('botón "Limpiar filtros" visible cuando userId está activo', () => {
    render(
      <AuditFilters
        filters={filtersWithUser}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.getByRole('button', { name: /limpiar filtros/i })).toBeInTheDocument()
  })

  it('botón "Limpiar filtros" visible cuando dateFrom está activo', () => {
    render(
      <AuditFilters
        filters={filtersWithDate}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.getByRole('button', { name: /limpiar filtros/i })).toBeInTheDocument()
  })

  it('onFiltersChange se llama con el valor correcto al cambiar el select de acción', async () => {
    const user = userEvent.setup()
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    const actionSelect = screen.getByRole('combobox', { name: /filtrar por acción/i })
    await user.selectOptions(actionSelect, 'patient_deleted')

    expect(onFiltersChange).toHaveBeenCalledOnce()
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patient_deleted' }),
    )
  })

  it('onFiltersChange se llama con el valor correcto al cambiar el select de usuario', async () => {
    const user = userEvent.setup()
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    const userSelect = screen.getByRole('combobox', { name: /filtrar por usuario/i })
    await user.selectOptions(userSelect, 'user-uuid-1')

    expect(onFiltersChange).toHaveBeenCalledOnce()
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-uuid-1' }),
    )
  })

  it('onFiltersChange se llama con { dateFrom: "2026-01-01" } al cambiar input de fecha desde', async () => {
    const user = userEvent.setup()
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    // DateField recibe dd/mm/aaaa (español) y emite el ISO yyyy-MM-dd correspondiente
    const fromInput = screen.getByLabelText(/fecha desde/i)
    await user.type(fromInput, '01012026')

    expect(onFiltersChange).toHaveBeenCalled()
    const lastCall = onFiltersChange.mock.calls[onFiltersChange.mock.calls.length - 1][0]
    expect(lastCall).toMatchObject({ dateFrom: expect.stringContaining('2026-01-01') })
  })

  it('onFiltersChange({}) se llama al hacer click en "Limpiar filtros"', async () => {
    const user = userEvent.setup()
    render(
      <AuditFilters
        filters={filtersWithAction}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    const clearBtn = screen.getByRole('button', { name: /limpiar filtros/i })
    await user.click(clearBtn)

    expect(onFiltersChange).toHaveBeenCalledOnce()
    expect(onFiltersChange).toHaveBeenCalledWith({})
  })

  it('el select de acción muestra las opciones correctas incluyendo "Todas las acciones"', () => {
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    const actionSelect = screen.getByRole('combobox', { name: /filtrar por acción/i })
    const options = Array.from(actionSelect.querySelectorAll('option')).map((o) => o.value)

    expect(options).toContain('')
    expect(options).toContain('patient_accessed')
    expect(options).toContain('patient_deleted')
    expect(options).toContain('appointment_created')
    expect(options).toContain('config_system_prompt_updated')

    expect(screen.getByText('Todas las acciones')).toBeInTheDocument()
  })

  it('muestra usuarios desactivados con "(desactivado)" en el dropdown', () => {
    render(
      <AuditFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
        users={mockUsers}
      />,
    )

    expect(screen.getByText(/Carlos López.*desactivado/i)).toBeInTheDocument()
  })
})

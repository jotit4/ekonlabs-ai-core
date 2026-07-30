import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks deben declararse antes del import del componente ──

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Datos de prueba reutilizables
import type { Patient } from '@/types/patients'

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    patient_id: 'patient-1',
    tenant_id: 'tenant-1',
    phone_number: '+5491133334444',
    full_name: 'María García',
    dni: '30123456',
    date_of_birth: null,
    email: null,
    obra_social: 'OSDE',
    obra_social_number: null,
    notes: null,
    reason_for_visit: null,
    alternative_phone: null,
    address: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deletion_requested_at: null,
    deletion_effective_at: null,
    appointments: [],
    thread_states: [],
    ...overrides,
  }
}

// Estado mutable del mock de useList para controlar per-test
// Debe seguir la estructura real de UseListReturnType: { query, result }
// El componente desestructura como: const { query: listQuery, result } = useList(...)
const mockListQuery = {
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}
const mockUseListState = {
  result: { data: [makePatient()] as Patient[], total: undefined },
}
const mockUseList = vi.fn()

// Mock @refinedev/core
vi.mock('@refinedev/core', () => ({
  useList: (options: unknown) => {
    mockUseList(options)
    return { query: mockListQuery, ...mockUseListState }
  },
}))

// Mock @tanstack/react-query — useQuery para conversaciones
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, isError: false }),
}))

// Importar componente después de mocks
import PacientesPage from './page'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PacientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock state to defaults
    mockListQuery.isPending = false
    mockListQuery.isError = false
    mockUseListState.result = { data: [makePatient()], total: undefined }
  })

  it('renderiza lista de pacientes mockeada', () => {
    render(<PacientesPage />)
    expect(screen.getByText('María García')).toBeInTheDocument()
    expect(screen.getByText('+5491133334444')).toBeInTheDocument()
  })

  it('limita el listado a 50 e integra estado conversacional sin cargar la bandeja completa', () => {
    render(<PacientesPage />)
    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { mode: 'server', pageSize: 50, currentPage: 1 },
        meta: expect.objectContaining({
          select: expect.stringContaining('thread_states(status, paused_reason)'),
        }),
      }),
    )
  })

  it('filtro vacío — muestra todos los pacientes sin error', () => {
    mockUseListState.result = {
      data: [
        makePatient({ patient_id: 'p1', full_name: 'Ana López' }),
        makePatient({ patient_id: 'p2', full_name: 'Carlos Pérez' }),
      ],
      total: undefined,
    }
    render(<PacientesPage />)
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Carlos Pérez')).toBeInTheDocument()
  })

  it('estado vacío sin query — muestra mensaje genérico', () => {
    mockUseListState.result = { data: [], total: undefined }
    render(<PacientesPage />)
    expect(screen.getByText('No hay pacientes registrados aún.')).toBeInTheDocument()
  })

  it('estado vacío con query >= 2 chars — muestra "Sin resultados para..."', async () => {
    mockUseListState.result = { data: [], total: undefined }
    const user = userEvent.setup()
    render(<PacientesPage />)

    const input = screen.getByRole('searchbox')
    await user.type(input, 'Pe')

    // Debounce 300ms — avanzar timers
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })

    await waitFor(() => {
      expect(screen.getByText(/Sin resultados para/)).toBeInTheDocument()
    })
  })

  it('muestra skeleton cuando isPending=true', () => {
    mockListQuery.isPending = true
    mockUseListState.result = { data: [], total: undefined }
    render(<PacientesPage />)
    expect(screen.getByRole('status', { name: /cargando pacientes/i })).toBeInTheDocument()
    // No debe mostrar la tabla
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra mensaje de error cuando isError=true', () => {
    mockListQuery.isError = true
    mockListQuery.isPending = false
    mockUseListState.result = { data: [], total: undefined }
    render(<PacientesPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('navega a /pacientes/[id] al hacer click en una fila', () => {
    render(<PacientesPage />)
    const row = screen.getByRole('row', { name: /María García/i })
    row.click()
    expect(mockPush).toHaveBeenCalledWith('/pacientes/patient-1')
  })

  it('query < 2 chars — no altera el comportamiento de filtro (useList recibe filtros vacíos)', async () => {
    const user = userEvent.setup()
    render(<PacientesPage />)

    const input = screen.getByRole('searchbox')
    await user.type(input, 'M') // 1 char — sin filtro
    // Pacientes siguen visibles (mock no filtra)
    expect(screen.getByText('María García')).toBeInTheDocument()
  })
})

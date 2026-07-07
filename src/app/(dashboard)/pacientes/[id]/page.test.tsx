import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks deben declararse antes del import del componente ──

// Usar vi.hoisted para variables mutables que se usan dentro de vi.mock factories
const { mockPush, mockTrigger, mockCurrentTenant, getSearchParams, setSearchParams } = vi.hoisted(() => {
  const mockPush = vi.fn()
  const mockTrigger = vi.fn().mockResolvedValue(undefined)
  const mockCurrentTenant = { tenantId: 'tenant-1', role: 'admin' as string | null, loading: false }
  let searchParamsValue = new URLSearchParams('')
  return {
    mockPush,
    mockTrigger,
    mockCurrentTenant,
    getSearchParams: () => searchParamsValue,
    setSearchParams: (v: URLSearchParams) => { searchParamsValue = v },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'patient-uuid-1' }),
  useSearchParams: () => getSearchParams(),
}))

vi.mock('@/hooks/use-soft-sync', () => ({
  useSoftSync: () => ({ trigger: mockTrigger, status: 'idle' }),
}))

vi.mock('@/hooks/use-current-tenant', () => ({
  useCurrentTenant: () => mockCurrentTenant,
}))

// Mock de fetch global (access-log)
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ ok: true }),
})
vi.stubGlobal('fetch', mockFetch)

// Mock de useQueryClient
const mockInvalidateQueries = vi.fn()

// Datos de prueba reutilizables
import type { Patient } from '@/types/patients'

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    patient_id: 'patient-uuid-1',
    tenant_id: 'tenant-1',
    phone_number: '+5491133334444',
    full_name: 'Ana López',
    dni: '30123456',
    date_of_birth: '1990-05-15',
    email: 'ana@example.com',
    obra_social: 'OSDE',
    obra_social_number: '123456',
    notes: 'Paciente frecuente',
    reason_for_visit: 'Control general',
    alternative_phone: null,
    address: 'Av. Corrientes 1234',
    lugar: null,
    ocupacion: null,
    derivacion: null,
    actividad_fisica: null,
    primary_professional_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deletion_requested_at: null,
    deletion_effective_at: null,
    appointments: [],
    thread_states: [],
    ...overrides,
  }
}

// Estado controlable de useQuery
type QueryState = {
  data: Patient | null
  isPending: boolean
  isError: boolean
}

const mockQueryState: QueryState = {
  data: makePatient(),
  isPending: false,
  isError: false,
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({})),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => ({
      data: mockQueryState.data,
      isPending: mockQueryState.isPending,
      isError: mockQueryState.isError,
    }),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

// Mock de PatientForm para aislar
vi.mock('@/components/pacientes/PatientForm', () => ({
  PatientForm: ({ onSuccess }: { onSuccess?: (id: string) => void }) => (
    <div data-testid="patient-form">
      <button onClick={() => onSuccess?.('patient-uuid-1')}>Guardar</button>
    </div>
  ),
}))

// Mock de AppointmentHistory para aislar
vi.mock('@/components/pacientes/AppointmentHistory', () => ({
  AppointmentHistory: ({ appointments }: { appointments: unknown[] | undefined }) => (
    <div data-testid="appointment-history">
      {!appointments || appointments.length === 0
        ? 'Sin turnos registrados'
        : `${appointments.length} turno(s)`}
    </div>
  ),
}))

// Mock de WhatsAppHistory para aislar
vi.mock('@/components/pacientes/WhatsAppHistory', () => ({
  WhatsAppHistory: ({ patientId }: { patientId: string }) => (
    <div data-testid="whatsapp-history">WhatsApp History {patientId}</div>
  ),
}))

// Mock de PatientStatusBadge para aislar
vi.mock('@/components/pacientes/PatientStatusBadge', () => ({
  PatientStatusBadge: () => <span data-testid="patient-status-badge">Estado</span>,
}))

// Mock de ClinicalNoteEditor para aislar
vi.mock('@/components/pacientes/ClinicalNoteEditor', () => ({
  ClinicalNoteEditor: ({ patientId }: { patientId: string }) => (
    <div data-testid="clinical-note-editor">ClinicalNoteEditor {patientId}</div>
  ),
}))

// Mock de ClinicalNotesHistory para aislar
vi.mock('@/components/pacientes/ClinicalNotesHistory', () => ({
  ClinicalNotesHistory: ({ patientId }: { patientId: string }) => (
    <div data-testid="clinical-notes-history">ClinicalNotesHistory {patientId}</div>
  ),
}))

// Mock de PatientDeletionRequest para aislar
vi.mock('@/components/pacientes/PatientDeletionRequest', () => ({
  PatientDeletionRequest: ({ patientName }: { patientName: string }) => (
    <button data-testid="deletion-request-btn">Solicitar eliminación ({patientName})</button>
  ),
}))

// Mock de PaquetesTracking para aislar (tiene su propia useQuery a Supabase)
vi.mock('@/components/paquetes/PaquetesTracking', () => ({
  PaquetesTracking: ({ patientId }: { patientId: string }) => (
    <div data-testid="paquetes-tracking">PaquetesTracking {patientId}</div>
  ),
}))

// Mock de NewPaqueteModal para aislar (usa useList de Refine, sin provider en este test)
vi.mock('@/components/paquetes/NewPaqueteModal', () => ({
  NewPaqueteModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-paquete-modal">NewPaqueteModal</div> : null,
}))

// Importar componente después de mocks
import PacienteFichaPage from './page'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PacienteFichaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryState.data = makePatient()
    mockQueryState.isPending = false
    mockQueryState.isError = false
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    mockCurrentTenant.role = 'admin'
    setSearchParams(new URLSearchParams(''))
  })

  it('muestra skeleton cuando está cargando', () => {
    mockQueryState.isPending = true
    mockQueryState.data = null

    render(<PacienteFichaPage />)
    expect(screen.getByRole('status', { name: /cargando ficha/i })).toBeInTheDocument()
  })

  it('muestra mensaje de error cuando isError=true', () => {
    mockQueryState.isError = true
    mockQueryState.data = null

    render(<PacienteFichaPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/error al cargar la ficha/i)).toBeInTheDocument()
  })

  it('muestra datos del paciente correctamente', async () => {
    render(<PacienteFichaPage />)

    await waitFor(() => {
      // El nombre aparece en h1 (header)
      const allAnaLopez = screen.getAllByText('Ana López')
      expect(allAnaLopez.length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText('+5491133334444')).toBeInTheDocument()
    expect(screen.getByText('30123456')).toBeInTheDocument()
    expect(screen.getByText('OSDE')).toBeInTheDocument()
  })

  // ── Ficha de admisión (migración 047 — Fase 1 digitalización) ───────────────

  it('muestra los campos de la ficha de admisión (lugar/ocupación/derivación/actividad física/KLGO a cargo)', async () => {
    mockQueryState.data = makePatient({
      lugar: 'Mendoza',
      ocupacion: 'Docente',
      derivacion: 'Dr. Pérez',
      actividad_fisica: 'Running 3x semana',
      primary_professional_id: 'prof-1',
      professionals: { name: 'Lic. Gómez' },
    })

    render(<PacienteFichaPage />)

    await waitFor(() => {
      expect(screen.getByText('Mendoza')).toBeInTheDocument()
    })
    expect(screen.getByText('Docente')).toBeInTheDocument()
    expect(screen.getByText('Dr. Pérez')).toBeInTheDocument()
    expect(screen.getByText('Running 3x semana')).toBeInTheDocument()
    // "KLGO a cargo" muestra el NOMBRE del profesional, nunca el uuid
    expect(screen.getByText('Lic. Gómez')).toBeInTheDocument()
    expect(screen.queryByText('prof-1')).not.toBeInTheDocument()
  })

  it('sin primary_professional_id → "KLGO a cargo" muestra el placeholder "—"', async () => {
    mockQueryState.data = makePatient({ primary_professional_id: null, professionals: null })

    render(<PacienteFichaPage />)

    await waitFor(() => {
      const allAnaLopez = screen.getAllByText('Ana López')
      expect(allAnaLopez.length).toBeGreaterThanOrEqual(1)
    })
    // Todos los DataField sin valor muestran "—" — solo confirmamos que no crashea
    // ni muestra un uuid/objeto vacío.
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('botón "‹ Pacientes" navega a /pacientes', async () => {
    const user = userEvent.setup()
    render(<PacienteFichaPage />)

    const backBtn = screen.getByRole('button', { name: /Pacientes/i })
    await user.click(backBtn)
    expect(mockPush).toHaveBeenCalledWith('/pacientes')
  })

  it('soft-sync se dispara al montar con patient_id', async () => {
    render(<PacienteFichaPage />)

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith('patient-uuid-1')
    })
  })

  it('access-log POST se dispara al montar', async () => {
    render(<PacienteFichaPage />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/patients/patient-uuid-1/access-log',
        { method: 'POST' }
      )
    })
  })

  it('botón "Editar datos" abre el dialog con PatientForm mode=edit', async () => {
    const user = userEvent.setup()
    render(<PacienteFichaPage />)

    const editBtn = screen.getByRole('button', { name: /editar datos/i })
    await user.click(editBtn)

    await waitFor(() => {
      expect(screen.getByTestId('patient-form')).toBeInTheDocument()
    })
  })

  it('muestra tabs de navegación incluyendo Conversaciones', () => {
    render(<PacienteFichaPage />)

    expect(screen.getByRole('tab', { name: /datos personales/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /historial de turnos/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /conversaciones/i })).toBeInTheDocument()
    // Notas clínicas visible para doctor/admin/receptionist (role=admin en mock)
    expect(screen.getByRole('tab', { name: /notas clínicas/i })).toBeInTheDocument()
  })

  it('PatientStatusBadge está visible en el header del paciente', () => {
    render(<PacienteFichaPage />)
    expect(screen.getByTestId('patient-status-badge')).toBeInTheDocument()
  })

  it('muestra "Paciente no encontrado" cuando patient es null', () => {
    mockQueryState.data = null

    render(<PacienteFichaPage />)
    expect(screen.getByText(/paciente no encontrado/i)).toBeInTheDocument()
  })

  // ── Tests de rol para tab "Notas clínicas" (Story 3.6) ───────────────────────

  it('rol receptionist → tab "Notas clínicas" SÍ aparece en el DOM (ISADI: recepción hace la carga clínica)', () => {
    mockCurrentTenant.role = 'receptionist'
    render(<PacienteFichaPage />)
    expect(screen.getByRole('tab', { name: /notas clínicas/i })).toBeInTheDocument()
  })

  it('rol doctor → tab "Notas clínicas" SÍ aparece en el DOM', () => {
    mockCurrentTenant.role = 'doctor'
    render(<PacienteFichaPage />)
    expect(screen.getByRole('tab', { name: /notas clínicas/i })).toBeInTheDocument()
  })

  it('rol admin → tab "Notas clínicas" SÍ aparece en el DOM', () => {
    mockCurrentTenant.role = 'admin'
    render(<PacienteFichaPage />)
    expect(screen.getByRole('tab', { name: /notas clínicas/i })).toBeInTheDocument()
  })

  it('?tab=notas con rol doctor → renderiza ClinicalNotesHistory y ClinicalNoteEditor', () => {
    mockCurrentTenant.role = 'doctor'
    setSearchParams(new URLSearchParams('tab=notas'))
    render(<PacienteFichaPage />)
    expect(screen.getByTestId('clinical-notes-history')).toBeInTheDocument()
    expect(screen.getByTestId('clinical-note-editor')).toBeInTheDocument()
  })

  it('?tab=notas con rol receptionist → renderiza ClinicalNotesHistory y ClinicalNoteEditor', () => {
    mockCurrentTenant.role = 'receptionist'
    setSearchParams(new URLSearchParams('tab=notas'))
    render(<PacienteFichaPage />)
    expect(screen.getByTestId('clinical-notes-history')).toBeInTheDocument()
    expect(screen.getByTestId('clinical-note-editor')).toBeInTheDocument()
  })

  // ── Tests de eliminación programada (Story 3.7) ─────────────────────────────

  it('paciente sin eliminación + rol admin → muestra botón "Solicitar eliminación"', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({ deletion_requested_at: null })

    render(<PacienteFichaPage />)
    expect(screen.getByTestId('deletion-request-btn')).toBeInTheDocument()
  })

  it('paciente sin eliminación + rol doctor → NO muestra botón "Solicitar eliminación"', () => {
    mockCurrentTenant.role = 'doctor'
    mockQueryState.data = makePatient({ deletion_requested_at: null })

    render(<PacienteFichaPage />)
    expect(screen.queryByTestId('deletion-request-btn')).not.toBeInTheDocument()
  })

  it('paciente sin eliminación + rol receptionist → NO muestra botón "Solicitar eliminación"', () => {
    mockCurrentTenant.role = 'receptionist'
    mockQueryState.data = makePatient({ deletion_requested_at: null })

    render(<PacienteFichaPage />)
    expect(screen.queryByTestId('deletion-request-btn')).not.toBeInTheDocument()
  })

  it('paciente CON eliminación pendiente → muestra banner "Eliminación programada para..."', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({
      deletion_requested_at: '2026-05-11T00:00:00Z',
      deletion_effective_at: '2026-06-10T00:00:00Z',
    })

    render(<PacienteFichaPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/eliminación programada para/i)).toBeInTheDocument()
  })

  it('paciente CON eliminación pendiente → NO muestra botón "Editar datos"', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({
      deletion_requested_at: '2026-05-11T00:00:00Z',
      deletion_effective_at: '2026-06-10T00:00:00Z',
    })

    render(<PacienteFichaPage />)
    expect(screen.queryByRole('button', { name: /editar datos/i })).not.toBeInTheDocument()
  })

  it('paciente CON eliminación pendiente → NO muestra botón "Solicitar eliminación"', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({
      deletion_requested_at: '2026-05-11T00:00:00Z',
      deletion_effective_at: '2026-06-10T00:00:00Z',
    })

    render(<PacienteFichaPage />)
    expect(screen.queryByTestId('deletion-request-btn')).not.toBeInTheDocument()
  })

  it('paciente CON eliminación + tab=notas con admin → NO muestra ClinicalNoteEditor', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({
      deletion_requested_at: '2026-05-11T00:00:00Z',
      deletion_effective_at: '2026-06-10T00:00:00Z',
    })
    setSearchParams(new URLSearchParams('tab=notas'))

    render(<PacienteFichaPage />)
    expect(screen.queryByTestId('clinical-note-editor')).not.toBeInTheDocument()
    // Pero el historial sí debe estar visible
    expect(screen.getByTestId('clinical-notes-history')).toBeInTheDocument()
  })

  // ── Tests de la pestaña "Paquetes" + CTA (Story 13.5) ───────────────────────

  it('muestra la pestaña "Paquetes" en la navegación', () => {
    render(<PacienteFichaPage />)
    expect(screen.getByRole('tab', { name: /paquetes/i })).toBeInTheDocument()
  })

  it('?tab=paquetes → renderiza PaquetesTracking', () => {
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)
    expect(screen.getByTestId('paquetes-tracking')).toBeInTheDocument()
  })

  it('tab=paquetes con rol admin → muestra el CTA "Cargar tratamiento (10 sesiones)"', () => {
    mockCurrentTenant.role = 'admin'
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)
    expect(
      screen.getByRole('button', { name: /cargar tratamiento \(10 sesiones\)/i }),
    ).toBeInTheDocument()
  })

  it('tab=paquetes con rol receptionist → muestra el CTA', () => {
    mockCurrentTenant.role = 'receptionist'
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)
    expect(
      screen.getByRole('button', { name: /cargar tratamiento \(10 sesiones\)/i }),
    ).toBeInTheDocument()
  })

  it('tab=paquetes con rol doctor → NO muestra el CTA de creación', () => {
    mockCurrentTenant.role = 'doctor'
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)
    expect(
      screen.queryByRole('button', { name: /cargar tratamiento/i }),
    ).not.toBeInTheDocument()
    // Pero la pestaña de tracking sí es visible para el doctor
    expect(screen.getByTestId('paquetes-tracking')).toBeInTheDocument()
  })

  it('paciente CON eliminación pendiente + admin → NO muestra el CTA de creación', () => {
    mockCurrentTenant.role = 'admin'
    mockQueryState.data = makePatient({
      deletion_requested_at: '2026-05-11T00:00:00Z',
      deletion_effective_at: '2026-06-10T00:00:00Z',
    })
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)
    expect(
      screen.queryByRole('button', { name: /cargar tratamiento/i }),
    ).not.toBeInTheDocument()
  })

  it('click en el CTA abre el NewPaqueteModal', async () => {
    const user = userEvent.setup()
    mockCurrentTenant.role = 'admin'
    setSearchParams(new URLSearchParams('tab=paquetes'))
    render(<PacienteFichaPage />)

    await user.click(screen.getByRole('button', { name: /cargar tratamiento/i }))
    await waitFor(() => {
      expect(screen.getByTestId('new-paquete-modal')).toBeInTheDocument()
    })
  })
})

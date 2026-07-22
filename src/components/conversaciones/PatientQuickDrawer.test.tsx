import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PatientQuickDrawer } from './PatientQuickDrawer'

// Mock base-ui dialog
vi.mock('@base-ui/react/dialog', async () => {
  const React = await import('react')
  return {
    Dialog: {
      Root: ({ open, onOpenChange, children }: any) =>
        open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
      Portal: ({ children }: any) => React.createElement('div', null, children),
      Backdrop: ({ onClick }: any) => React.createElement('div', { 'data-testid': 'backdrop', onClick }),
      Popup: ({ children }: any) => React.createElement('div', { role: 'dialog' }, children),
      Title: ({ children }: any) => React.createElement('h2', null, children),
      Close: ({ children, onClick }: any) =>
        React.createElement('button', { type: 'button', onClick }, children),
    },
  }
})

// Mock AbsenceDecisionDialog
vi.mock('@/components/agenda/AbsenceDecisionDialog', () => ({
  AbsenceDecisionDialog: () => <div data-testid="absence-decision-dialog" />,
}))

// Mock fetch API call
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock Supabase
let mockTreatmentsData: any[] = []
let mockAppointmentsData: any[] = []
let mockPatientData: any = null

const mockSingle = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockGte = vi.fn()
const mockOrder = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    from: (table: string) => {
      const builder: any = {
        select: (cols?: string) => {
          mockSelect(table, cols)
          return builder
        },
        eq: (col: string, val: any) => {
          mockEq(table, col, val)
          return builder
        },
        in: (col: string, vals: any) => {
          mockIn(table, col, vals)
          return builder
        },
        gte: (col: string, val: any) => {
          mockGte(table, col, val)
          return builder
        },
        order: (col: string, opts?: any) => {
          mockOrder(table, col, opts)
          return builder
        },
        single: () => {
          mockSingle(table)
          return Promise.resolve({ data: mockPatientData, error: null })
        },
        then: (cb: any) => {
          if (table === 'treatments') {
            return Promise.resolve(cb({ data: mockTreatmentsData, error: null }))
          }
          if (table === 'appointments') {
            return Promise.resolve(cb({ data: mockAppointmentsData, error: null }))
          }
          return Promise.resolve(cb({ data: null, error: null }))
        }
      }
      return builder
    }
  })
}))

// Mock useAppointmentActions hook
const mockHandleAttendanceSelect = vi.fn()
const mockHandleAbsenceConfirm = vi.fn()
const mockClearAbsenceTarget = vi.fn()

vi.mock('@/hooks/use-appointment-actions', () => ({
  useAppointmentActions: () => ({
    cancelTarget: null,
    cancelLoading: false,
    cancelError: null,
    setCancelTarget: vi.fn(),
    clearCancelError: vi.fn(),
    handleCancelConfirm: vi.fn(),
    attendanceLoading: false,
    handleAttendanceSelect: mockHandleAttendanceSelect,
    absenceTarget: null,
    absenceLoading: false,
    absenceError: null,
    clearAbsenceTarget: mockClearAbsenceTarget,
    handleAbsenceConfirm: mockHandleAbsenceConfirm,
    colorLoading: false,
    colorError: null,
    handleColorChange: vi.fn(),
  }),
}))

describe('PatientQuickDrawer', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    // Seed mock data
    mockPatientData = {
      patient_id: 'patient-123',
      full_name: 'Juan Perez',
      dni: '12345678',
      obra_social: 'OSDE',
      phone_number: '1234567890',
    }

    mockTreatmentsData = [
      {
        treatment_id: 'treatment-1',
        total_sessions: 10,
        sessions_remaining: 7,
        status: 'active',
        services: { name: 'Kinesiología' },
      },
    ]

    mockAppointmentsData = [
      {
        appointment_id: 'appt-1',
        patient_id: 'patient-123',
        service_id: 'svc-1',
        start_at: '2026-08-01T10:00:00Z',
        end_at: '2026-08-01T10:30:00Z',
        status: 'confirmed',
        package_id: null,
        session_index: null,
        reminder_sent_at: null,
        attendance_confirmed: null,
        patients: { full_name: 'Juan Perez' },
        services: { name: 'Kinesiología' },
        professionals: { name: 'Klg. Lopez' },
        treatments: null,
      },
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ patient: { ...mockPatientData, dni: '99999999', obra_social: 'Swiss' } }),
    })
  })

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <PatientQuickDrawer patientId="patient-123" open={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )
  }

  it('renderiza datos del paciente y entradas editables', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument()
    })

    const dniInput = screen.getByLabelText('DNI') as HTMLInputElement
    const osInput = screen.getByLabelText('Obra Social') as HTMLInputElement

    expect(dniInput.value).toBe('12345678')
    expect(osInput.value).toBe('OSDE')
  })

  it('guarda cambios correctamente al enviar el formulario', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText('DNI')).toBeInTheDocument()
    })

    const dniInput = screen.getByLabelText('DNI') as HTMLInputElement
    const osInput = screen.getByLabelText('Obra Social') as HTMLInputElement
    const saveButton = screen.getByRole('button', { name: 'Guardar' })

    fireEvent.change(dniInput, { target: { value: '87654321' } })
    fireEvent.change(osInput, { target: { value: 'Swiss Medical' } })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/patients/patient-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            full_name: 'Juan Perez',
            phone_number: '1234567890',
            dni: '87654321',
            obra_social: 'Swiss Medical',
          }),
        })
      )
    })
  })

  it('muestra el balance de los paquetes activos con porcentaje de progreso', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Kinesiología')).toBeInTheDocument()
      expect(screen.getByText(/7 de 10.*restantes/)).toBeInTheDocument()
    })
  })

  it('muestra la lista de próximos turnos y permite marcar inasistencia', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Klg. Lopez/)).toBeInTheDocument()
    })

    const inasistenciaBtn = screen.getByRole('button', { name: 'Marcar inasistencia' })
    fireEvent.click(inasistenciaBtn)

    expect(mockHandleAttendanceSelect).toHaveBeenCalledWith(
      expect.objectContaining({ appointment_id: 'appt-1' }),
      'no_show'
    )
  })

  it('muestra botón Descartar cuando se modifican los campos', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText('DNI')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()

    const dniInput = screen.getByLabelText('DNI') as HTMLInputElement
    fireEvent.change(dniInput, { target: { value: '87654321' } })

    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
  })
})

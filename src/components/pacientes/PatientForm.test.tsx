import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PatientForm } from './PatientForm'
import type { Patient } from '@/types/patients'
import type { ObraSocialSelection } from './ObraSocialSelector'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Mock useProfessionals — "KLGO a cargo" (migración 047, ficha de admisión).
// Se mockea el hook directamente (no @tanstack/react-query, que arriba solo
// expone useQueryClient) — mismo patrón que ProfesionalesView.test.tsx.
// vi.hoisted: el factory de vi.mock corre ANTES de las const del módulo — sin
// esto, mockUseProfessionals se leería en TDZ (ReferenceError).
const { mockUseProfessionals } = vi.hoisted(() => ({
  mockUseProfessionals: vi.fn(),
}))
vi.mock('@/hooks/use-professionals', () => ({
  useProfessionals: mockUseProfessionals,
}))

// professional_id como UUID real — primary_professional_id valida formato UUID
// (z.string().uuid()) en el schema del form, igual que en producción.
const PROFESSIONAL_ID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const PROFESSIONAL_ID_2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const PROFESSIONAL_ID_3 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'

const ACTIVE_PROFESSIONAL_1 = {
  professional_id: PROFESSIONAL_ID_1,
  tenant_id: 'tenant-1',
  name: 'Lic. Gómez',
  email: 'gomez@clinica.com',
  active: true,
  created_at: '2026-05-01T00:00:00Z',
  services: [],
  linked_user_email: null,
}

const ACTIVE_PROFESSIONAL_2 = {
  ...ACTIVE_PROFESSIONAL_1,
  professional_id: PROFESSIONAL_ID_2,
  name: 'Lic. Fernández',
}

const INACTIVE_PROFESSIONAL = {
  ...ACTIVE_PROFESSIONAL_1,
  professional_id: PROFESSIONAL_ID_3,
  name: 'Lic. Inactivo',
  active: false,
}

// Mock ObraSocialSelector para aislar PatientForm de la implementación del selector.
// El mock renderiza un select nativo accesible como reemplazo simplificado.
let capturedOnChange: ((val: ObraSocialSelection | null) => void) | undefined
vi.mock('./ObraSocialSelector', async () => {
  const React = await import('react')
  return {
    ObraSocialSelector: (props: {
      value: ObraSocialSelection | null
      onChange: (val: ObraSocialSelection | null) => void
      disabled?: boolean
    }) => {
      capturedOnChange = props.onChange
      const entidad = props.value?.entidad ?? ''
      const plan = props.value?.plan ?? ''
      return React.createElement('div', { 'data-testid': 'obra-social-selector' },
        React.createElement('span', { 'data-testid': 'selector-entidad' }, entidad),
        React.createElement('span', { 'data-testid': 'selector-plan' }, plan),
      )
    },
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    patient_id: 'patient-test-1',
    tenant_id: 'tenant-1',
    phone_number: '1133334444',
    full_name: 'María García',
    dni: '30123456',
    date_of_birth: null,
    email: null,
    obra_social: null,
    obra_social_number: null,
    notes: null,
    reason_for_visit: null,
    alternative_phone: null,
    address: null,
    lugar: null,
    ocupacion: null,
    derivacion: null,
    actividad_fisica: null,
    primary_professional_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deletion_requested_at: null,
    deletion_effective_at: null,
    ...overrides,
  }
}

function setupProfessionalsMock(
  professionals = [ACTIVE_PROFESSIONAL_1, ACTIVE_PROFESSIONAL_2, INACTIVE_PROFESSIONAL],
) {
  mockUseProfessionals.mockReturnValue({
    professionals,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PatientForm — modo create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    setupProfessionalsMock()
  })

  it('renderiza todos los campos del formulario', () => {
    render(<PatientForm mode="create" />)

    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument()
    // phone_number: usar el id directamente para evitar ambigüedad con "Teléfono alternativo"
    expect(document.getElementById('phone_number')).toBeInTheDocument()
    expect(screen.getByLabelText(/^DNI$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha de nacimiento/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    // ObraSocialSelector reemplaza el input de texto libre — Story 3.3
    expect(screen.getByTestId('obra-social-selector')).toBeInTheDocument()
    expect(screen.getByLabelText(/número de afiliado/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/domicilio/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/teléfono alternativo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/motivo de consulta/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument()
    // Ficha de admisión (migración 047 — Fase 1 digitalización)
    expect(screen.getByLabelText(/^lugar$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ocupación/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/derivación/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/actividad física/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/klgo a cargo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear paciente/i })).toBeInTheDocument()
  })

  it('el select "KLGO a cargo" solo muestra profesionales activos', () => {
    render(<PatientForm mode="create" />)

    const select = screen.getByLabelText(/klgo a cargo/i)
    expect(select).toHaveTextContent('Lic. Gómez')
    expect(select).toHaveTextContent('Lic. Fernández')
    expect(select).not.toHaveTextContent('Lic. Inactivo')
    // Opción "Sin asignar" siempre presente para permitir dejar el campo vacío
    expect(select).toHaveTextContent('Sin asignar')
  })

  it('modo create — el body del POST incluye los campos de la ficha de admisión', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: { patient_id: 'new-patient-id' } }),
        { status: 201 }
      )
    )

    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Lucía Fernández')
    await user.type(document.getElementById('phone_number')!, '1133334444')
    await user.type(screen.getByLabelText(/^lugar$/i), 'Mendoza')
    await user.type(screen.getByLabelText(/ocupación/i), 'Docente')
    await user.type(screen.getByLabelText(/derivación/i), 'Dr. Pérez')
    await user.type(screen.getByLabelText(/actividad física/i), 'Running 3x semana')
    await user.selectOptions(screen.getByLabelText(/klgo a cargo/i), PROFESSIONAL_ID_1)

    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    const call = mockFetch.mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.lugar).toBe('Mendoza')
    expect(body.ocupacion).toBe('Docente')
    expect(body.derivacion).toBe('Dr. Pérez')
    expect(body.actividad_fisica).toBe('Running 3x semana')
    expect(body.primary_professional_id).toBe(PROFESSIONAL_ID_1)
  })

  it('en modo create, ObraSocialSelector se renderiza vacío (sin entidad ni plan)', () => {
    render(<PatientForm mode="create" />)

    const entidadSpan = screen.getByTestId('selector-entidad')
    const planSpan = screen.getByTestId('selector-plan')
    expect(entidadSpan).toHaveTextContent('')
    expect(planSpan).toHaveTextContent('')
  })

  it('muestra error inline si full_name está vacío al submit', async () => {
    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    // Llenar solo teléfono y dejar nombre vacío (usar id para evitar ambigüedad)
    await user.type(document.getElementById('phone_number')!, '1122334455')
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('2'))).toBe(true)
    })
  })

  it('muestra error inline si phone_number está vacío al submit', async () => {
    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    // Llenar solo nombre y dejar teléfono vacío
    await user.type(screen.getByLabelText(/nombre completo/i), 'Ana López')
    // No llenamos phone_number
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('teléfono'))).toBe(true)
    })
  })

  it('muestra error si DNI no tiene 7 u 8 dígitos', async () => {
    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Pedro Ramírez')
    await user.type(document.getElementById('phone_number')!, '1122334455')
    await user.type(screen.getByLabelText(/^DNI$/i), '12345') // solo 5 dígitos

    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('DNI'))).toBe(true)
    })
  })

  it('DNI vacío es válido (campo opcional)', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: { patient_id: 'new-patient-id' } }),
        { status: 201 }
      )
    )

    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm mode="create" onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Carlos Pérez')
    await user.type(document.getElementById('phone_number')!, '1122334455')
    // DNI vacío — no se escribe nada

    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    // No debería haber errores de DNI
    const alerts = screen.queryAllByRole('alert')
    expect(alerts.every((el) => !el.textContent?.includes('DNI'))).toBe(true)
  })

  it('modo create — hace POST a /api/patients', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: { patient_id: 'new-patient-id' } }),
        { status: 201 }
      )
    )

    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Lucía Fernández')
    await user.type(document.getElementById('phone_number')!, '1133334444')
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/patients',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('error 409 con mensaje DNI muestra "Ya existe un paciente con ese DNI"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Ya existe un paciente con ese DNI' }),
        { status: 409 }
      )
    )

    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Lucía Fernández')
    await user.type(document.getElementById('phone_number')!, '1133334444')
    await user.type(screen.getByLabelText(/^DNI$/i), '30123456')
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('Ya existe un paciente con ese DNI'))).toBe(true)
    })
  })

  it('en éxito llama onSuccess con el patient_id', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: { patient_id: 'created-patient-123' } }),
        { status: 201 }
      )
    )

    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm mode="create" onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Sofía Castro')
    await user.type(document.getElementById('phone_number')!, '1144445555')
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('created-patient-123')
    })
  })

  it('con entidad pero sin plan, no hace fetch y muestra error "Seleccioná un plan de cobertura"', async () => {
    const mockFetch = vi.spyOn(global, 'fetch')
    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Valentina López')
    await user.type(document.getElementById('phone_number')!, '1199998888')

    // Simular selección de entidad sin plan (plan vacío)
    capturedOnChange?.({ entidad: 'OSEP', plan: '' })

    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('Seleccioná un plan de cobertura'))).toBe(true)
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('botón deshabilitado durante isSubmitting', async () => {
    let resolveResponse!: (value: Response) => void
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        })
    )

    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García')
    await user.type(document.getElementById('phone_number')!, '1122334455')
    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled()
    })

    // Resolver para no dejar promesa colgada
    resolveResponse(new Response(JSON.stringify({ patient: { patient_id: 'p-1' } }), { status: 201 }))
  })
})

describe('PatientForm — modo edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    setupProfessionalsMock()
  })

  it('modo edit — hace PATCH a /api/patients/[id]', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: makePatient() }),
        { status: 200 }
      )
    )

    const patient = makePatient()
    const user = userEvent.setup()
    render(<PatientForm mode="edit" patient={patient} />)

    // Botón debería decir "Guardar cambios"
    const submitBtn = screen.getByRole('button', { name: /guardar cambios/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/patients/${patient.patient_id}`,
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('pre-llena los campos con los datos del paciente en modo edit', () => {
    const patient = makePatient({
      full_name: 'Carlos Rodríguez',
      phone_number: '1155556666',
      dni: '25678901',
    })
    render(<PatientForm mode="edit" patient={patient} />)

    expect(screen.getByLabelText(/nombre completo/i)).toHaveValue('Carlos Rodríguez')
    // Usar el id para evitar ambigüedad con "Teléfono alternativo"
    expect(document.getElementById('phone_number')).toHaveValue('1155556666')
    expect(screen.getByLabelText(/^DNI$/i)).toHaveValue('25678901')
  })

  it('pre-llena los campos de la ficha de admisión en modo edit', () => {
    const patient = makePatient({
      lugar: 'San Rafael',
      ocupacion: 'Contador',
      derivacion: 'Dra. Gómez',
      actividad_fisica: 'Natación',
      primary_professional_id: PROFESSIONAL_ID_2,
    })
    render(<PatientForm mode="edit" patient={patient} />)

    expect(screen.getByLabelText(/^lugar$/i)).toHaveValue('San Rafael')
    expect(screen.getByLabelText(/ocupación/i)).toHaveValue('Contador')
    expect(screen.getByLabelText(/derivación/i)).toHaveValue('Dra. Gómez')
    expect(screen.getByLabelText(/actividad física/i)).toHaveValue('Natación')
    expect(screen.getByLabelText(/klgo a cargo/i)).toHaveValue(PROFESSIONAL_ID_2)
  })

  it('en modo edit sin primary_professional_id, "KLGO a cargo" queda en "Sin asignar"', () => {
    const patient = makePatient({ primary_professional_id: null })
    render(<PatientForm mode="edit" patient={patient} />)

    expect(screen.getByLabelText(/klgo a cargo/i)).toHaveValue('')
  })

  it('en modo edit con obra_social "OSEP — Plan 200", el selector muestra entidad OSEP y plan Plan 200', () => {
    const patient = makePatient({ obra_social: 'OSEP — Plan 200' })
    render(<PatientForm mode="edit" patient={patient} />)

    expect(screen.getByTestId('selector-entidad')).toHaveTextContent('OSEP')
    expect(screen.getByTestId('selector-plan')).toHaveTextContent('Plan 200')
  })

  it('al seleccionar obra social, el body del fetch incluye el campo serializado "Entidad — Plan"', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ patient: { patient_id: 'new-patient-id' } }),
        { status: 201 }
      )
    )

    const user = userEvent.setup()
    render(<PatientForm mode="create" />)

    // Simular que el selector de obra social llama onChange con una selección
    // capturedOnChange fue asignado al renderizar el ObraSocialSelector mock
    await user.type(screen.getByLabelText(/nombre completo/i), 'Valentina López')
    await user.type(document.getElementById('phone_number')!, '1199998888')

    // Simular selección de obra social desde el mock del selector
    capturedOnChange?.({ entidad: 'Galeno', plan: 'Plan Oro' })

    await user.click(screen.getByRole('button', { name: /crear paciente/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    const call = mockFetch.mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.obra_social).toBe('Galeno — Plan Oro')
  })
})

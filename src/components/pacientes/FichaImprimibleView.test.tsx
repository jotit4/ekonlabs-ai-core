import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { FichaDossier } from '@/types/ficha'
import { calculateAge } from '@/lib/pacientes/ficha-helpers'

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { FichaImprimibleView } from './FichaImprimibleView'

function makeDossier(overrides: Partial<FichaDossier> = {}): FichaDossier {
  return {
    patient: {
      patient_id: 'patient-1',
      full_name: 'Ana López',
      dni: '30123456',
      date_of_birth: '1990-05-15',
      phone_number: '+5491133334444',
      address: 'Calle Falsa 123',
      obra_social: 'OSDE',
      obra_social_number: '9999',
      reason_for_visit: 'Rehab rodilla',
      notes: 'Paciente puntual',
      antecedentes: 'Hipertensión',
      medicacion: 'Losartán',
      cirugias: 'Meniscectomía 2020',
      lugar: 'Mendoza',
      ocupacion: 'Docente',
      derivacion: 'Dr. Traumatólogo',
      actividad_fisica: 'Running',
      primary_professional_name: 'Dr. Juan Pérez',
    },
    tratamientoObjetivo: 'Recuperar movilidad',
    treatments: [
      {
        treatment_id: 'tr-1',
        service_name: 'Kinesiología',
        total_sessions: 2,
        rows: [
          { session_index: 1, start_at: '2026-06-05T10:00:00Z', status: 'completed' },
          { session_index: 2, start_at: null, status: null },
        ],
      },
    ],
    evolucion: [
      {
        session_note_id: 'note-1',
        session_index: 1,
        start_at: '2026-06-05T10:00:00Z',
        worked_on: 'Movilización pasiva',
        progress: 'Buena tolerancia',
        author_name: 'Lic. Carla Ruiz',
      },
    ],
    limitations: {
      clinicalFieldsUnavailable: false,
      treatmentPlansUnavailable: false,
      sessionNotesUnavailable: false,
    },
    ...overrides,
  }
}

function makeEmptyDossier(): FichaDossier {
  return {
    patient: {
      patient_id: 'patient-2',
      full_name: 'Paciente Vacío',
      dni: null,
      date_of_birth: null,
      phone_number: '+5491100000000',
      address: null,
      obra_social: null,
      obra_social_number: null,
      reason_for_visit: null,
      notes: null,
      antecedentes: null,
      medicacion: null,
      cirugias: null,
      lugar: null,
      ocupacion: null,
      derivacion: null,
      actividad_fisica: null,
      primary_professional_name: null,
    },
    tratamientoObjetivo: null,
    treatments: [],
    evolucion: [],
    limitations: {
      clinicalFieldsUnavailable: false,
      treatmentPlansUnavailable: false,
      sessionNotesUnavailable: false,
    },
  }
}

describe('FichaImprimibleView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('print', vi.fn())
  })

  it('renderiza la cabecera de admisión con los datos del paciente', () => {
    render(<FichaImprimibleView dossier={makeDossier()} />)

    expect(screen.getByText('ISADI — Ficha kinesiológica')).toBeInTheDocument()
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    const expectedAge = calculateAge('1990-05-15')
    expect(screen.getByText(`${expectedAge} años`)).toBeInTheDocument()
    expect(screen.getByText('30123456')).toBeInTheDocument()
    expect(screen.getByText('Dr. Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('Rehab rodilla')).toBeInTheDocument()
    expect(screen.getByText('Hipertensión')).toBeInTheDocument()
    expect(screen.getByText('Recuperar movilidad')).toBeInTheDocument()
    expect(screen.getByText('Losartán')).toBeInTheDocument()
  })

  it('renderiza el control de sesiones por tratamiento', () => {
    render(<FichaImprimibleView dossier={makeDossier()} />)

    expect(screen.getByText('Control de sesiones')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /cabecera de admisión/i })).toBeInTheDocument()
    // Sesión 2 sin turno agendado → "Pendiente"
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('renderiza la evolución por sesión con detalle y autor', () => {
    render(<FichaImprimibleView dossier={makeDossier()} />)

    expect(screen.getByText('Evolución por sesión')).toBeInTheDocument()
    expect(screen.getByText(/Movilización pasiva — Buena tolerancia/)).toBeInTheDocument()
    expect(screen.getByText('Lic. Carla Ruiz')).toBeInTheDocument()
  })

  it('muestra el aviso de limitaciones cuando alguna migración no está aplicada', () => {
    render(
      <FichaImprimibleView
        dossier={makeDossier({
          limitations: {
            clinicalFieldsUnavailable: true,
            treatmentPlansUnavailable: false,
            sessionNotesUnavailable: false,
          },
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/no están disponibles/i)
  })

  it('no muestra el aviso de limitaciones cuando todo está disponible', () => {
    render(<FichaImprimibleView dossier={makeDossier()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('el botón Imprimir / Guardar PDF llama a window.print()', async () => {
    const user = userEvent.setup()
    render(<FichaImprimibleView dossier={makeDossier()} />)

    await user.click(screen.getByRole('button', { name: /imprimir.*pdf/i }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  it('el botón Volver navega a la ficha del paciente', async () => {
    const user = userEvent.setup()
    render(<FichaImprimibleView dossier={makeDossier()} />)

    await user.click(screen.getByRole('button', { name: /volver a la ficha/i }))
    expect(mockPush).toHaveBeenCalledWith('/pacientes/patient-1')
  })

  it('paciente vacío: renderiza guiones y mensajes de "sin datos" sin romper', () => {
    render(<FichaImprimibleView dossier={makeEmptyDossier()} />)

    expect(screen.getByText('Paciente Vacío')).toBeInTheDocument()
    expect(screen.getByText('Este paciente no tiene paquetes/tratamientos cargados.')).toBeInTheDocument()
    expect(screen.getByText('Sin evoluciones registradas.')).toBeInTheDocument()
    // Guiones para campos sin dato — al menos uno presente (DNI, dirección, etc.)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Story 14.5: el wrapper se testea AISLADO — PatientDocuments mockeado (stub que
// registra props). Sin QueryClientProvider (el wrapper no usa react-query) ni
// fake timers (no hay debounce).
const { mockPatientDocuments } = vi.hoisted(() => ({
  mockPatientDocuments: vi.fn(),
}))

vi.mock('@/components/pacientes/PatientDocuments', () => ({
  PatientDocuments: (props: { patientId: string; readOnly?: boolean }) => {
    mockPatientDocuments(props)
    return <div data-testid="patient-documents" />
  },
}))

import { HceEstudiosPanel } from './HceEstudiosPanel'

const PATIENT_ID = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HceEstudiosPanel', () => {
  it('arranca colapsado: toggle con aria-expanded=false y PatientDocuments NO montado (cero fetch)', () => {
    render(<HceEstudiosPanel patientId={PATIENT_ID} />)

    const toggle = screen.getByRole('button', { name: /estudios y documentos/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('patient-documents')).not.toBeInTheDocument()
    expect(mockPatientDocuments).not.toHaveBeenCalled()
  })

  it('al expandir: aria-expanded=true, línea de contexto y PatientDocuments montado con patientId y readOnly default false', async () => {
    const user = userEvent.setup()
    render(<HceEstudiosPanel patientId={PATIENT_ID} />)

    await user.click(screen.getByRole('button', { name: /estudios y documentos/i }))

    expect(screen.getByRole('button', { name: /estudios y documentos/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText(/mismo repositorio que el tab documentos/i)).toBeInTheDocument()
    expect(screen.getByTestId('patient-documents')).toBeInTheDocument()
    expect(mockPatientDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT_ID, readOnly: false })
    )
  })

  it('re-click colapsa: aria-expanded=false y PatientDocuments desmontado', async () => {
    const user = userEvent.setup()
    render(<HceEstudiosPanel patientId={PATIENT_ID} />)

    const toggle = screen.getByRole('button', { name: /estudios y documentos/i })
    await user.click(toggle)
    expect(screen.getByTestId('patient-documents')).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('patient-documents')).not.toBeInTheDocument()
  })

  it('readOnly=true se pasa tal cual a PatientDocuments (passthrough)', async () => {
    const user = userEvent.setup()
    render(<HceEstudiosPanel patientId={PATIENT_ID} readOnly />)

    await user.click(screen.getByRole('button', { name: /estudios y documentos/i }))

    expect(mockPatientDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT_ID, readOnly: true })
    )
  })
})

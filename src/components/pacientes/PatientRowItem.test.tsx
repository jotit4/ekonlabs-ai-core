import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PatientRowItem } from './PatientRowItem'
import type { Patient } from '@/types/patients'

// Helper para construir un Patient de prueba
function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    patient_id: 'patient-1',
    tenant_id: 'tenant-1',
    phone_number: '+5491133334444',
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deletion_requested_at: null,
    deletion_effective_at: null,
    appointments: [],
    thread_states: [],
    ...overrides,
  }
}

// Envuelve el componente en una tabla para que <tr> sea válido en el DOM
function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>
  )
}

describe('PatientRowItem', () => {
  it('renderiza nombre y teléfono del paciente', () => {
    renderInTable(<PatientRowItem patient={makePatient()} onClick={() => {}} />)
    expect(screen.getByText('María García')).toBeInTheDocument()
    expect(screen.getByText('+5491133334444')).toBeInTheDocument()
  })

  it('muestra — en Obra social si está vacía (null)', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({ obra_social: null })}
        onClick={() => {}}
      />
    )
    // Hay múltiples — (obra social + turnos sin datos), verificamos con getAllByText
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
    // La celda de obra social (índice 1) debe mostrar —
    const cells = screen.getAllByRole('cell')
    expect(cells[1].textContent).toBe('—')
  })

  it('muestra — en turnos si no hay appointments', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({ appointments: [] })}
        onClick={() => {}}
      />
    )
    // Debe haber al menos 2 guiones (último turno y próximo turno)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('muestra fecha formateada si hay appointments en el pasado (último turno)', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10)

    renderInTable(
      <PatientRowItem
        patient={makePatient({
          appointments: [
            {
              appointment_id: 'apt-1',
              start_at: pastDate.toISOString(),
              end_at: new Date(pastDate.getTime() + 3600000).toISOString(),
              status: 'confirmed',
            },
          ],
        })}
        onClick={() => {}}
      />
    )
    // Debe haber una fecha en el último turno — al menos una celda sin guión en la columna
    // Verificamos que el texto del último turno no sea '—' buscando el elemento de fecha
    const cells = screen.getAllByRole('cell')
    const lastTurnoCell = cells[2] // columna índice 2 = Último turno
    expect(lastTurnoCell.textContent).not.toBe('—')
  })

  it('muestra fecha formateada si hay appointments en el futuro (próximo turno)', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5)

    renderInTable(
      <PatientRowItem
        patient={makePatient({
          appointments: [
            {
              appointment_id: 'apt-2',
              start_at: futureDate.toISOString(),
              end_at: new Date(futureDate.getTime() + 3600000).toISOString(),
              status: 'confirmed',
            },
          ],
        })}
        onClick={() => {}}
      />
    )
    const cells = screen.getAllByRole('cell')
    const nextTurnoCell = cells[3] // columna índice 3 = Próximo turno
    expect(nextTurnoCell.textContent).not.toBe('—')
  })

  it('StatusDot active cuando thread_state.status = active', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({
          thread_states: [{ status: 'active', paused_reason: null }],
        })}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('IA activa')).toBeInTheDocument()
  })

  it('StatusDot warning cuando thread_state.status = paused y paused_reason = low_confidence', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({
          thread_states: [
            { status: 'paused', paused_reason: 'low_confidence' },
          ],
        })}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Necesita ayuda')).toBeInTheDocument()
  })

  it('StatusDot inactive cuando no hay thread_state', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({ thread_states: [] })}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Sin conversación')).toBeInTheDocument()
  })

  it('dispara onClick al presionar Enter (teclado)', () => {
    const handleClick = vi.fn()
    renderInTable(
      <PatientRowItem patient={makePatient()} onClick={handleClick} />
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('dispara onClick al hacer click', () => {
    const handleClick = vi.fn()
    renderInTable(
      <PatientRowItem patient={makePatient()} onClick={handleClick} />
    )
    const row = screen.getByRole('row')
    fireEvent.click(row)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  // ── Tests de eliminación programada (Story 3.7) ─────────────────────────────

  it('paciente sin eliminación pendiente → NO muestra "Eliminación programada"', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({ deletion_requested_at: null })}
        onClick={() => {}}
      />
    )
    expect(screen.queryByText(/eliminación programada/i)).not.toBeInTheDocument()
  })

  it('paciente con deletion_requested_at → muestra "· Eliminación programada"', () => {
    renderInTable(
      <PatientRowItem
        patient={makePatient({ deletion_requested_at: '2026-05-11T00:00:00Z' })}
        onClick={() => {}}
      />
    )
    expect(screen.getByText(/eliminación programada/i)).toBeInTheDocument()
  })
})

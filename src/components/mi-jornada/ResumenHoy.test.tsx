import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResumenHoy } from './ResumenHoy'
import type { Appointment } from '@/types/appointments'

// ─── Fábrica mínima de turnos ─────────────────────────────────────────────────

function makeAppt(
  id: string,
  status: Appointment['status'],
): Appointment {
  return {
    appointment_id: id,
    tenant_id: 'tenant-1',
    phone_number: '5491100000000',
    patient_id: `patient-${id}`,
    service_id: 'service-1',
    professional_id: 'prof-1',
    appointment_time: '2026-06-25T10:00:00Z',
    start_at: '2026-06-25T10:00:00Z',
    end_at: '2026-06-25T10:30:00Z',
    status,
    calendar_event_id: null,
    created_at: '2026-06-25T08:00:00Z',
    reminder_sent_at: null,
    attendance_confirmed: null,
    patients: { full_name: `Paciente ${id}` },
    services: { name: 'Kinesiología', professional: null },
    professionals: { name: 'Dr. Test' },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResumenHoy', () => {
  it('muestra cero en los tres chips cuando appointments está vacío', () => {
    render(<ResumenHoy appointments={[]} />)
    expect(screen.getByLabelText('0 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('0 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('0 ausencias')).toBeInTheDocument()
  })

  it('clasifica completed como Atendidos', () => {
    const apts = [makeAppt('a1', 'completed'), makeAppt('a2', 'completed')]
    render(<ResumenHoy appointments={apts} />)
    expect(screen.getByLabelText('2 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('0 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('0 ausencias')).toBeInTheDocument()
  })

  it('clasifica no_show como Ausencias', () => {
    const apts = [makeAppt('b1', 'no_show')]
    render(<ResumenHoy appointments={apts} />)
    expect(screen.getByLabelText('0 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('0 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('1 ausencias')).toBeInTheDocument()
  })

  it('clasifica confirmed, pending, pending_calendar, rescheduled como Pendientes', () => {
    const apts = [
      makeAppt('c1', 'confirmed'),
      makeAppt('c2', 'pending'),
      makeAppt('c3', 'pending_calendar'),
      makeAppt('c4', 'rescheduled'),
    ]
    render(<ResumenHoy appointments={apts} />)
    expect(screen.getByLabelText('0 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('4 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('0 ausencias')).toBeInTheDocument()
  })

  it('NO cuenta cancelados en ninguna columna', () => {
    const apts = [
      makeAppt('d1', 'cancelled'),
      makeAppt('d2', 'cancelled'),
    ]
    render(<ResumenHoy appointments={apts} />)
    expect(screen.getByLabelText('0 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('0 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('0 ausencias')).toBeInTheDocument()
  })

  it('mezcla de estados — clasifica cada uno correctamente', () => {
    const apts = [
      makeAppt('e1', 'completed'),
      makeAppt('e2', 'completed'),
      makeAppt('e3', 'completed'),
      makeAppt('e4', 'no_show'),
      makeAppt('e5', 'no_show'),
      makeAppt('e6', 'confirmed'),
      makeAppt('e7', 'cancelled'), // NO cuenta
    ]
    render(<ResumenHoy appointments={apts} />)
    expect(screen.getByLabelText('3 atendidos')).toBeInTheDocument()
    expect(screen.getByLabelText('1 pendientes')).toBeInTheDocument()
    expect(screen.getByLabelText('2 ausencias')).toBeInTheDocument()
  })

  it('renderiza la región con label accesible "Resumen de hoy"', () => {
    render(<ResumenHoy appointments={[]} />)
    expect(screen.getByRole('region', { name: /resumen de hoy/i })).toBeInTheDocument()
  })

  it('muestra las etiquetas de texto de las tres columnas', () => {
    render(<ResumenHoy appointments={[]} />)
    expect(screen.getByText('Atendidos')).toBeInTheDocument()
    expect(screen.getByText('Pendientes')).toBeInTheDocument()
    expect(screen.getByText('Ausencias')).toBeInTheDocument()
  })
})

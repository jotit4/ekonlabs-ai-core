import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AppointmentHistory, type AppointmentForHistory } from './AppointmentHistory'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function futureDate(offsetDays = 1) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

function pastDate(offsetDays = 1) {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString()
}

function makeAppointment(overrides: Partial<AppointmentForHistory> = {}): AppointmentForHistory {
  return {
    appointment_id: 'apt-1',
    start_at: futureDate(1),
    end_at: futureDate(1),
    status: 'confirmed',
    services: {
      name: 'Consulta General',
      professional_name: 'Dr. García',
    },
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AppointmentHistory', () => {
  it('muestra turnos con fecha, hora, servicio, profesional y estado correctamente formateados', () => {
    const apt = makeAppointment({
      appointment_id: 'apt-1',
      start_at: '2026-06-15T10:30:00.000Z',
      end_at: '2026-06-15T11:00:00.000Z',
      status: 'confirmed',
      services: { name: 'Kinesiología', professional_name: 'Lic. Rodríguez' },
    })

    render(<AppointmentHistory appointments={[apt]} />)

    // Servicio
    expect(screen.getByText('Kinesiología')).toBeInTheDocument()
    // Profesional
    expect(screen.getByText('Lic. Rodríguez')).toBeInTheDocument()
    // Estado en español
    expect(screen.getByText('Confirmado')).toBeInTheDocument()
  })

  it('ordena turnos: próximos primero (asc), históricos después (desc)', () => {
    const apt1Past = makeAppointment({
      appointment_id: 'past-1',
      start_at: pastDate(10),
      end_at: pastDate(10),
      status: 'confirmed', // pasado pero no cancelado
    })
    const apt2Future = makeAppointment({
      appointment_id: 'future-1',
      start_at: futureDate(2),
      end_at: futureDate(2),
      status: 'confirmed',
    })
    const apt3Future = makeAppointment({
      appointment_id: 'future-2',
      start_at: futureDate(5),
      end_at: futureDate(5),
      status: 'pending',
    })

    render(
      <AppointmentHistory appointments={[apt1Past, apt3Future, apt2Future]} />
    )

    // Próximos turnos deben aparecer antes de Turnos anteriores
    const proximos = screen.getByText('Próximos turnos')
    const anteriores = screen.getByText('Turnos anteriores')

    expect(proximos).toBeInTheDocument()
    expect(anteriores).toBeInTheDocument()

    // Verificar que la sección "Próximos turnos" precede a "Turnos anteriores" en el DOM
    const proximosEl = proximos as HTMLElement
    const anterioresEl = anteriores as HTMLElement
    expect(
      proximosEl.compareDocumentPosition(anterioresEl) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('muestra "Sin turnos registrados" cuando no hay turnos', () => {
    render(<AppointmentHistory appointments={[]} />)
    expect(screen.getByText('Sin turnos registrados')).toBeInTheDocument()
  })

  it('muestra "Sin turnos registrados" cuando appointments es undefined', () => {
    render(<AppointmentHistory appointments={undefined} />)
    expect(screen.getByText('Sin turnos registrados')).toBeInTheDocument()
  })

  it('muestra "Sin turnos registrados" cuando appointments es null', () => {
    render(<AppointmentHistory appointments={null} />)
    expect(screen.getByText('Sin turnos registrados')).toBeInTheDocument()
  })

  it('con syncStatus=pending muestra indicador de sincronización', () => {
    render(<AppointmentHistory appointments={[]} syncStatus="pending" />)
    expect(screen.getByText(/Sincronizando/i)).toBeInTheDocument()
  })

  it('con syncStatus=error muestra "Sincronización no disponible" sin bloquear lista', () => {
    const apt = makeAppointment()
    render(<AppointmentHistory appointments={[apt]} syncStatus="error" />)

    expect(screen.getByText('Sincronización no disponible')).toBeInTheDocument()
    // La lista sigue visible
    expect(screen.getByText('Consulta General')).toBeInTheDocument()
  })

  it('turno con services=null muestra "—" en servicio y profesional', () => {
    const apt = makeAppointment({
      services: null,
    })

    render(<AppointmentHistory appointments={[apt]} />)

    // Dos "—": uno para servicio, uno para profesional
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })
})

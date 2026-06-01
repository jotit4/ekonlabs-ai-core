import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KPIStrip, KPIStripSkeleton } from './KPIStrip'
import type { Appointment } from '@/types/appointments'

const makeAppointment = (status: Appointment['status'], id: string): Appointment => ({
  appointment_id: id,
  tenant_id: 'test-tenant',
  phone_number: '+54911',
  patient_id: null,
  service_id: 'svc-1',
  appointment_time: new Date().toISOString(),
  start_at: new Date().toISOString(),
  end_at: new Date(Date.now() + 3600000).toISOString(),
  status,
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: new Date().toISOString(),
  patients: { full_name: 'Test Paciente' },
  services: { name: 'Kinesiología', professional: 'Dra. Test' },
})

describe('KPIStrip', () => {
  const mockAppointments: Appointment[] = [
    makeAppointment('confirmed', '1'),
    makeAppointment('confirmed', '2'),
    makeAppointment('cancelled', '3'),
    makeAppointment('no_show', '4'),
    makeAppointment('pending', '5'),
  ]

  it('renderiza 5 tarjetas con conteos correctos', () => {
    render(<KPIStrip appointments={mockAppointments} isLoading={false} isError={false} />)
    expect(screen.getByText('5')).toBeInTheDocument() // Total
    expect(screen.getByText('2')).toBeInTheDocument() // Confirmados
    // Cancelados, no-shows y pendientes tienen 1 cada uno — getByText('1') encontrará al menos uno
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Confirmados')).toBeInTheDocument()
    expect(screen.getByText('Cancelados')).toBeInTheDocument()
    expect(screen.getByText('No-shows')).toBeInTheDocument()
    expect(screen.getByText('Pendientes')).toBeInTheDocument()
  })

  it('muestra cálculo correcto de cada status', () => {
    render(<KPIStrip appointments={mockAppointments} isLoading={false} isError={false} />)
    // Total: 5, Confirmados: 2, Cancelados: 1, No-shows: 1, Pendientes: 1
    const ones = screen.getAllByText('1')
    expect(ones.length).toBe(3) // Cancelados, No-shows, Pendientes
  })

  it('muestra 0 en todas las tarjetas cuando no hay turnos', () => {
    render(<KPIStrip appointments={[]} isLoading={false} isError={false} />)
    const zeros = screen.getAllByText('0')
    expect(zeros).toHaveLength(5)
  })

  it('muestra skeleton cuando isLoading=true', () => {
    render(<KPIStrip appointments={[]} isLoading={true} isError={false} />)
    expect(screen.getByLabelText('Cargando KPIs del día')).toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('muestra guiones cuando isError=true sin crash', () => {
    render(<KPIStrip appointments={[]} isLoading={false} isError={true} />)
    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(5)
  })

  it('el total es la longitud completa del array independiente de status', () => {
    const apts = [
      makeAppointment('confirmed', '1'),
      makeAppointment('rescheduled', '2'), // status que no es uno de los 4 contados individualmente
    ]
    render(<KPIStrip appointments={apts} isLoading={false} isError={false} />)
    expect(screen.getByText('2')).toBeInTheDocument() // Total = 2
  })

  it('KPIStripSkeleton renderiza 5 tarjetas con aria-label correcto', () => {
    render(<KPIStripSkeleton />)
    expect(screen.getByLabelText('Cargando KPIs del día')).toBeInTheDocument()
  })
})

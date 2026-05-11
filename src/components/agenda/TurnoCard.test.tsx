import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TurnoCard } from './TurnoCard'
import type { Appointment } from '@/types/appointments'

const BASE_APT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  appointment_time: '2026-05-07T09:00:00',
  start_at: '2026-05-07T09:00:00',
  end_at: '2026-05-07T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'Juan García' },
  services: { name: 'Kinesiología', professional: 'Dra. Patricia Pérez' },
}

describe('TurnoCard', () => {
  it('muestra la hora en formato HH:mm', () => {
    render(<TurnoCard appointment={BASE_APT} />)
    expect(screen.getByText('09:00')).toBeInTheDocument()
  })

  it('muestra el nombre del paciente', () => {
    render(<TurnoCard appointment={BASE_APT} />)
    expect(screen.getByText('Juan García')).toBeInTheDocument()
  })

  it('muestra servicio y profesional', () => {
    render(<TurnoCard appointment={BASE_APT} />)
    expect(screen.getByText(/Kinesiología · Dra\. Patricia Pérez/)).toBeInTheDocument()
  })

  it('muestra etiqueta de estado en español', () => {
    render(<TurnoCard appointment={BASE_APT} />)
    expect(screen.getByText('Confirmado')).toBeInTheDocument()
  })

  it('muestra StatusDot con aria-label correcto', () => {
    render(<TurnoCard appointment={BASE_APT} />)
    expect(screen.getByRole('img', { name: 'Estado: Confirmado' })).toBeInTheDocument()
  })

  it('muestra "Paciente desconocido" cuando patients es null', () => {
    render(<TurnoCard appointment={{ ...BASE_APT, patients: null }} />)
    expect(screen.getByText('Paciente desconocido')).toBeInTheDocument()
  })

  it('no muestra profesional cuando es null', () => {
    render(
      <TurnoCard
        appointment={{ ...BASE_APT, services: { name: 'Fisioterapia', professional: null } }}
      />
    )
    expect(screen.getByText('Fisioterapia')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('muestra estado "No-show" para status no_show', () => {
    render(<TurnoCard appointment={{ ...BASE_APT, status: 'no_show' }} />)
    expect(screen.getByText('No-show')).toBeInTheDocument()
  })

  it('tiene altura mínima de 44px (min-h-[44px])', () => {
    const { container } = render(<TurnoCard appointment={BASE_APT} />)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('min-h-[44px]')
  })
})

import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TurnoCard } from './TurnoCard'
import type { Appointment } from '@/types/appointments'

// next/link necesita mock en jsdom — sin contexto de Next.js Router, <Link> fallaría.
vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('a', { href, ...props }, children),
  }
})

// useUserRole devuelve null en el estado de carga — el link se renderiza con
// la ruta genérica /pacientes/{id} (sin tab deeplink), comportamiento compatible
// con los tests existentes que solo buscan el texto del paciente.
vi.mock('@/hooks/use-user-role', () => ({
  useUserRole: vi.fn(() => null),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null } })) },
  })),
}))

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
  reminder_sent_at: null,
  attendance_confirmed: null,
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

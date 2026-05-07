import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AgendaDayView } from './AgendaDayView'
import type { Appointment } from '@/types/appointments'

const mockRefetch = vi.fn()
const mockUseList = vi.fn()

vi.mock('@refinedev/core', () => ({
  useList: (...args: unknown[]) => mockUseList(...args),
}))

function makeUseListResult(overrides: {
  isPending?: boolean
  isError?: boolean
  data?: Appointment[]
  elapsedTime?: number
}) {
  const { isPending = false, isError = false, data = [], elapsedTime = 0 } = overrides
  return {
    query: {
      isPending,
      isError,
      refetch: mockRefetch,
      data: { data, total: data.length },
    },
    result: { data, total: data.length },
    overtime: { elapsedTime },
  }
}

const SAMPLE_APPOINTMENTS: Appointment[] = [
  {
    appointment_id: 'apt-1',
    tenant_id: 'tenant-1',
    phone_number: '+541100000000',
    patient_id: 'pat-1',
    service_id: 'svc-1',
    appointment_time: '2026-05-07T12:00:00',
    status: 'confirmed',
    calendar_event_id: null,
    created_at: '2026-05-01T00:00:00',
    patients: { full_name: 'Juan García' },
    services: { name: 'Kinesiología', professional: 'Patricia Pérez' },
  },
  {
    appointment_id: 'apt-2',
    tenant_id: 'tenant-1',
    phone_number: '+541100000001',
    patient_id: 'pat-2',
    service_id: 'svc-2',
    appointment_time: '2026-05-07T14:00:00',
    status: 'pending',
    calendar_event_id: null,
    created_at: '2026-05-01T00:00:00',
    patients: { full_name: 'María López' },
    services: { name: 'Fisioterapia', professional: 'Rocío González' },
  },
  {
    appointment_id: 'apt-3',
    tenant_id: 'tenant-1',
    phone_number: '+541100000002',
    patient_id: 'pat-3',
    service_id: 'svc-3',
    appointment_time: '2026-05-07T15:00:00',
    status: 'cancelled',
    calendar_event_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    patients: { full_name: 'Carlos Ruiz' },
    services: { name: 'Pilates', professional: 'Patricia Pérez' },
  },
]

describe('AgendaDayView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado de carga', () => {
    it('muestra skeleton mientras isPending y no hay timeout', () => {
      mockUseList.mockReturnValue(makeUseListResult({ isPending: true, elapsedTime: 0 }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    })

    it('muestra skeleton cuando isPending y elapsedTime < 5000ms', () => {
      mockUseList.mockReturnValue(makeUseListResult({ isPending: true, elapsedTime: 4999 }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    })

    it('muestra error inline cuando elapsedTime >= 5000ms', () => {
      mockUseList.mockReturnValue(makeUseListResult({ isPending: true, elapsedTime: 5000 }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })
  })

  describe('estado de error', () => {
    it('muestra error inline con botón Reintentar cuando isError', () => {
      mockUseList.mockReturnValue(makeUseListResult({ isError: true }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })

    it('llama a refetch al hacer click en Reintentar', async () => {
      mockUseList.mockReturnValue(makeUseListResult({ isError: true }))
      const user = userEvent.setup()
      render(<AgendaDayView date="2026-05-07" />)
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockRefetch).toHaveBeenCalledOnce()
    })

    it('no muestra spinner genérico — usa texto inline', () => {
      mockUseList.mockReturnValue(makeUseListResult({ isError: true }))
      const { container } = render(<AgendaDayView date="2026-05-07" />)
      expect(container.querySelector('[role="progressbar"]')).toBeNull()
      expect(container.querySelector('.spinner')).toBeNull()
    })
  })

  describe('estado vacío', () => {
    it('muestra "Sin turnos para hoy" cuando no hay datos', () => {
      mockUseList.mockReturnValue(makeUseListResult({ data: [] }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByText('Sin turnos para hoy')).toBeInTheDocument()
    })
  })

  describe('vista con datos', () => {
    beforeEach(() => {
      mockUseList.mockReturnValue(makeUseListResult({ data: SAMPLE_APPOINTMENTS }))
    })

    it('muestra turnos agrupados por profesional', () => {
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByText('Patricia Pérez')).toBeInTheDocument()
      expect(screen.getByText('Rocío González')).toBeInTheDocument()
    })

    it('muestra todos los pacientes', () => {
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByText('Juan García')).toBeInTheDocument()
      expect(screen.getByText('María López')).toBeInTheDocument()
      expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
    })

    it('los turnos del mismo profesional aparecen en la misma sección', () => {
      render(<AgendaDayView date="2026-05-07" />)
      const patriciaSection = screen.getByRole('region', { name: 'Patricia Pérez' })
      // Patricia Pérez tiene 2 turnos (apt-1 y apt-3)
      const cards = patriciaSection.querySelectorAll('[class*="min-h-[44px]"]')
      expect(cards.length).toBe(2)
    })

    it('muestra estados en español', () => {
      render(<AgendaDayView date="2026-05-07" />)
      expect(screen.getByText('Confirmado')).toBeInTheDocument()
      expect(screen.getByText('Pendiente')).toBeInTheDocument()
      expect(screen.getByText('Cancelado')).toBeInTheDocument()
    })
  })

  describe('parámetros de query', () => {
    it('llama a useList con resource appointments y filtros de rango del día', () => {
      mockUseList.mockReturnValue(makeUseListResult({ data: [] }))
      render(<AgendaDayView date="2026-05-07" />)
      expect(mockUseList).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'appointments',
          meta: expect.objectContaining({
            select: expect.stringContaining('patients(full_name)'),
          }),
          pagination: { mode: 'off' },
          queryOptions: expect.objectContaining({
            queryKey: ['agenda', 'day', '2026-05-07'],
            staleTime: 0,
          }),
        }),
      )
    })
  })
})

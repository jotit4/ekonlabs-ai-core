import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'

// Mock next/link (TurnoDetailModal — no se monta acá, pero por seguridad de imports)
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { CalendarView } from './CalendarView'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: null,
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
  professionals: null,
}

const FREE_SHIFT: AvailabilityShift = {
  open: '08:00',
  close: '08:30',
  slot_start_iso: '2026-05-07T11:00:00Z',
  slot_end_iso: '2026-05-07T11:30:00Z',
  service_id: 'svc-1',
  service_name: 'Kinesiología',
  require_referral: false,
  professional_id: 'prof-1',
  professional_name: 'Dra. Pérez',
}

const mockOnRefetch = vi.fn()

describe('CalendarView (grilla Día)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estados de carga', () => {
    it('muestra mensaje vacío cuando no hay turnos ni huecos', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText(/sin turnos para este día/i)).toBeInTheDocument()
    })

    it('muestra skeleton cuando isLoading=true', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[]} isLoading={true} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
    })

    it('muestra error con botón Reintentar cuando isError=true', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[]} isLoading={false} isError={true} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })

    it('llama onRefetch al hacer click en Reintentar', async () => {
      const user = userEvent.setup()
      render(
        <CalendarView date="2026-05-07" appointments={[]} isLoading={false} isError={true} onRefetch={mockOnRefetch} />,
      )
      await user.click(screen.getByRole('button', { name: /reintentar/i }))
      expect(mockOnRefetch).toHaveBeenCalledOnce()
    })
  })

  describe('renderizado de turnos (celda ocupada)', () => {
    it('muestra el nombre del paciente', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
    })

    it('muestra la franja horaria de la fila', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      // La columna HORA ancla la franja de las 09:00
      expect(screen.getByText('09:00')).toBeInTheDocument()
    })

    it('muestra el nombre del servicio en el chip', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText(/Kinesiología/)).toBeInTheDocument()
    })

    it('ordena los turnos cronológicamente (fila más temprana primero)', () => {
      const earlyApt: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-2',
        start_at: '2026-05-07T07:00:00',
        end_at: '2026-05-07T08:00:00',
        patients: { full_name: 'Ana López' },
      }
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT, earlyApt]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      const names = screen.getAllByText(/Ana López|Juan García/)
      expect(names[0]).toHaveTextContent('Ana López')
      expect(names[1]).toHaveTextContent('Juan García')
    })

    it('filtra appointments inválidos (sin start_at)', () => {
      const invalidApt = { ...BASE_APPOINTMENT, appointment_id: 'apt-bad', start_at: null } as unknown as Appointment
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT, invalidApt]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getAllByText('Juan García')).toHaveLength(1)
    })

    it('muestra el estado del turno en la accesibilidad del chip', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[{ ...BASE_APPOINTMENT, status: 'no_show' }]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      // El chip es un button cuyo nombre accesible incluye el estado.
      expect(screen.getByRole('button', { name: /no-show/i })).toBeInTheDocument()
      // Nota: la leyenda de estados se movió a AgendaView (se monta una vez para
      // todas las vistas), por lo que ya no vive dentro de CalendarView.
    })
  })

  describe('columnas por profesional', () => {
    const aptPerez: Appointment = {
      ...BASE_APPOINTMENT,
      appointment_id: 'apt-perez',
      patients: { full_name: 'Juan García' },
      professionals: { name: 'Dra. Pérez' },
    }
    const aptLuque: Appointment = {
      ...BASE_APPOINTMENT,
      appointment_id: 'apt-luque',
      start_at: '2026-05-07T11:00:00',
      end_at: '2026-05-07T12:00:00',
      patients: { full_name: 'Ana López' },
      professionals: { name: 'Aldo Luque' },
    }

    it('renderiza un encabezado de columna por cada profesional con turnos', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[aptPerez, aptLuque]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Dra. Pérez')).toBeInTheDocument()
      expect(screen.getByText('Aldo Luque')).toBeInTheDocument()
    })

    it('muestra a cada paciente en la grilla', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[aptPerez, aptLuque]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
      expect(screen.getByText('Ana López')).toBeInTheDocument()
    })
  })

  describe('detalle del turno', () => {
    it('llama onAppointmentClick al hacer click en el chip', async () => {
      const user = userEvent.setup()
      const onAppointmentClick = vi.fn()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onAppointmentClick={onAppointmentClick}
        />,
      )
      await user.click(screen.getByRole('button', { name: /juan garcía/i }))
      expect(onAppointmentClick).toHaveBeenCalledWith(BASE_APPOINTMENT)
    })

    it('el nombre del paciente NO es un link en la grilla (Ver ficha vive en el modal)', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Juan García')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /ver ficha/i })).not.toBeInTheDocument()
    })
  })

  describe('celdas libres', () => {
    it('renderiza un hueco libre clickeable (sin texto "+ Libre")', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShifts={[FREE_SHIFT]}
        />,
      )
      expect(screen.queryByText(/\+ Libre/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /agendar a las 08:00 con dra\. pérez/i })).toBeInTheDocument()
    })

    it('el profesional del hueco aparece como encabezado de columna', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShifts={[FREE_SHIFT]}
        />,
      )
      expect(screen.getByText('Dra. Pérez')).toBeInTheDocument()
    })

    it('click en un hueco libre llama onFreeSlotClick con el shift', async () => {
      const user = userEvent.setup()
      const onFreeSlotClick = vi.fn()
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShifts={[FREE_SHIFT]}
          onFreeSlotClick={onFreeSlotClick}
        />,
      )
      await user.click(screen.getByRole('button', { name: /agendar a las 08:00/i }))
      expect(onFreeSlotClick).toHaveBeenCalledWith(FREE_SHIFT)
    })

    it('sin freeShifts no hay botones de agendar (no regresión)', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.queryByRole('button', { name: /agendar a las/i })).not.toBeInTheDocument()
    })

    it('dos huecos del mismo profesional/hora se colapsan a "2 libres" sin warning de key', () => {
      const shiftA: AvailabilityShift = { ...FREE_SHIFT, service_id: 'svc-A', service_name: 'Kinesiología' }
      const shiftB: AvailabilityShift = { ...FREE_SHIFT, service_id: 'svc-B', service_name: 'Fisioterapia' }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          freeShifts={[shiftA, shiftB]}
          onFreeSlotClick={vi.fn()}
        />,
      )

      // Varios huecos a la misma hora colapsan a un contador ("2 libres"), no se
      // listan individualmente (evita el ruido y que la celda agrande la fila).
      const collapsed = screen.getByRole('button', { name: /2 horarios libres a las 08:00/i })
      expect(collapsed).toBeInTheDocument()

      const duplicateKeyWarning = errorSpy.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && (a.includes('same key') || a.includes('unique key'))),
      )
      expect(duplicateKeyWarning).toBe(false)
      errorSpy.mockRestore()
    })
  })

  describe('FIX B — skeleton de disponibilidad', () => {
    // Dos turnos en la MISMA columna (Sin profesional) a las 08:00 y 12:00 → la
    // ventana activa 08–12 deja celdas vacías intermedias (09, 10, 11) dentro del
    // horario, donde debe aparecer el skeleton mientras carga la disponibilidad.
    const apt8: Appointment = {
      ...BASE_APPOINTMENT,
      appointment_id: 'a8',
      start_at: '2026-05-07T08:00:00',
      end_at: '2026-05-07T09:00:00',
    }
    const apt12: Appointment = {
      ...BASE_APPOINTMENT,
      appointment_id: 'a12',
      start_at: '2026-05-07T12:00:00',
      end_at: '2026-05-07T13:00:00',
    }

    it('muestra skeleton en celdas vacías dentro del horario cuando availabilityLoading=true', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[apt8, apt12]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          availabilityLoading
        />,
      )
      expect(screen.getAllByTestId('turnero-cell-skeleton').length).toBeGreaterThan(0)
    })

    it('NO muestra skeleton cuando availabilityLoading=false (huecos vacíos discretos)', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[apt8, apt12]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          availabilityLoading={false}
        />,
      )
      expect(screen.queryByTestId('turnero-cell-skeleton')).not.toBeInTheDocument()
    })

    it('con día vacío y disponibilidad cargando muestra el skeleton del día (no "Sin turnos")', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          availabilityLoading
        />,
      )
      expect(screen.getByLabelText('Cargando turnos')).toBeInTheDocument()
      expect(screen.queryByText(/sin turnos para este día/i)).not.toBeInTheDocument()
    })
  })

  describe('badge de serie (paquetes)', () => {
    it('muestra "Sesión X/N" cuando el turno pertenece a una serie', () => {
      const serieApt: Appointment = {
        ...BASE_APPOINTMENT,
        package_id: 'trt-1',
        session_index: 3,
        treatments: { total_sessions: 10, status: 'active' },
      }
      render(
        <CalendarView date="2026-05-07" appointments={[serieApt]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Sesión 3/10')).toBeInTheDocument()
    })

    it('NO muestra badge de serie para un turno suelto', () => {
      render(
        <CalendarView date="2026-05-07" appointments={[BASE_APPOINTMENT]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.queryByText(/^Sesión /)).not.toBeInTheDocument()
    })

    it('degrada a "Sesión X" cuando el treatment no es visible (join null)', () => {
      const serieApt: Appointment = {
        ...BASE_APPOINTMENT,
        package_id: 'trt-1',
        session_index: 2,
        treatments: null,
      }
      render(
        <CalendarView date="2026-05-07" appointments={[serieApt]} isLoading={false} isError={false} onRefetch={mockOnRefetch} />,
      )
      expect(screen.getByText('Sesión 2')).toBeInTheDocument()
    })
  })
})

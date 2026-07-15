import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'

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

  // ─── Filtro de estado en la agenda (decisión 2026-07-14) ─────────────────────
  // Los CANCELADOS desaparecen de la grilla (como borrar la celda en el Excel);
  // el estado se conserva en el modelo/detalle, solo se filtra ACÁ (la vista).
  // Los no_show SÍ se siguen mostrando (el turno existió y ocupó el horario).
  describe('filtro de cancelados (no se muestran en la agenda)', () => {
    it('NO muestra un turno cancelado', () => {
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[{ ...BASE_APPOINTMENT, status: 'cancelled' }]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.queryByText('Juan García')).not.toBeInTheDocument()
      expect(screen.getByText(/sin turnos para este día/i)).toBeInTheDocument()
    })

    it('SÍ muestra un turno no_show (junto a uno cancelado, que se oculta)', () => {
      const noShowApt: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-no-show',
        status: 'no_show',
        patients: { full_name: 'Pedro Ausente' },
      }
      const cancelledApt: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-cancelled',
        status: 'cancelled',
        patients: { full_name: 'Ana Cancelada' },
        start_at: '2026-05-07T11:00:00',
        end_at: '2026-05-07T12:00:00',
      }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[noShowApt, cancelledApt]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByText('Pedro Ausente')).toBeInTheDocument()
      expect(screen.queryByText('Ana Cancelada')).not.toBeInTheDocument()
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

  // ─── Celda vacía → atajo "Dar un turno" (pedido ISADI 2026-07-14) ──────────
  // Los huecos libres ("N libres" / chip individual) se retiraron del
  // calendario. El atajo "click en hueco → Nuevo turno prellenado" se preserva,
  // pero ahora lo dispara la CELDA VACÍA de la grilla (ya no hay datos de
  // disponibilidad: solo se conocen fecha/hora, y el profesional cuando la
  // columna clickeada ya identifica a uno real).
  describe('celda vacía → atajo "Dar un turno"', () => {
    it('una celda vacía dentro del horario activo de la columna es clickeable', async () => {
      const user = userEvent.setup()
      const onEmptyCellClick = vi.fn()
      // Dos turnos en la columna "Sin profesional" (09:00 y 11:00) → la ventana
      // activa 09–11 deja la celda 10:00 vacía y dentro del horario.
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-07T11:00:00',
        end_at: '2026-05-07T12:00:00',
      }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onEmptyCellClick={onEmptyCellClick}
        />,
      )
      const emptyCellBtn = screen.getByRole('button', { name: /dar un turno a las 10:00/i })
      await user.click(emptyCellBtn)
      // BASE_APPOINTMENT no tiene professional_id ni professionals/services.professional_name
      // reales → columna sintética "Sin profesional" → professionalId=undefined.
      expect(onEmptyCellClick).toHaveBeenCalledWith('2026-05-07', '10:00', undefined)
    })

    it('en la columna de un profesional real, pasa su professional_id', async () => {
      const user = userEvent.setup()
      const onEmptyCellClick = vi.fn()
      const aptA: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-a',
        professional_id: 'prof-77',
        professionals: { name: 'Dra. Real' },
        start_at: '2026-05-07T09:00:00',
        end_at: '2026-05-07T10:00:00',
      }
      const aptB: Appointment = {
        ...aptA,
        appointment_id: 'apt-b',
        start_at: '2026-05-07T11:00:00',
        end_at: '2026-05-07T12:00:00',
      }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[aptA, aptB]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
          onEmptyCellClick={onEmptyCellClick}
        />,
      )
      const emptyCellBtn = screen.getByRole('button', { name: /dar un turno a las 10:00/i })
      await user.click(emptyCellBtn)
      expect(onEmptyCellClick).toHaveBeenCalledWith('2026-05-07', '10:00', 'prof-77')
    })

    it('sin onEmptyCellClick, la celda vacía no rompe el render', () => {
      const aptLater: Appointment = {
        ...BASE_APPOINTMENT,
        appointment_id: 'apt-later',
        start_at: '2026-05-07T11:00:00',
        end_at: '2026-05-07T12:00:00',
      }
      render(
        <CalendarView
          date="2026-05-07"
          appointments={[BASE_APPOINTMENT, aptLater]}
          isLoading={false}
          isError={false}
          onRefetch={mockOnRefetch}
        />,
      )
      expect(screen.getByRole('button', { name: /dar un turno a las 10:00/i })).toBeInTheDocument()
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

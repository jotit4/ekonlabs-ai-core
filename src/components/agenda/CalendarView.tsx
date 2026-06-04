'use client'

import { useState, useRef, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Pencil, X, Clock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'
import { AgendaDayViewSkeleton } from './AgendaDayView'
import { ReminderBadge } from './ReminderBadge'

function getEventColor(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return '#0071e3'
    case 'completed':
      return '#22c55e'
    case 'rescheduled':
      return '#f97316'
    case 'cancelled':
      return '#8e8e93'
    case 'no_show':
      return '#ef4444'
    case 'pending':
    case 'pending_calendar':
    default:
      return '#8b5cf6'
  }
}

// ─── Modal de confirmación para cancelar turno ────────────────────────────────

interface CancelConfirmModalProps {
  patientName: string
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}

function CancelConfirmModal({ patientName, onConfirm, onClose, isLoading }: CancelConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-turno-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 0,
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'var(--color-bg)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          width: '100%',
          maxWidth: 400,
          padding: 24,
        }}
      >
        <h2
          id="cancel-turno-title"
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 12,
          }}
        >
          ¿Cancelar el turno de {patientName}?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            marginBottom: 24,
          }}
        >
          Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              minHeight: 44,
            }}
          >
            No, volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#ef4444',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: 'white',
              minHeight: 44,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Cancelando...' : 'Sí, cancelar turno'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dropdown de asistencia ───────────────────────────────────────────────────

interface AttendanceDropdownProps {
  patientName: string
  onSelect: (status: 'completed' | 'no_show') => void
  onClose: () => void
  isLoading: boolean
}

function AttendanceDropdown({ patientName, onSelect, onClose, isLoading }: AttendanceDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Marcar asistencia para ${patientName}`}
      style={{
        position: 'absolute',
        right: 0,
        top: 36,
        zIndex: 20,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        minWidth: 200,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={isLoading}
        onClick={() => onSelect('completed')}
        style={{
          width: '100%',
          padding: '10px 16px',
          textAlign: 'left',
          border: 'none',
          background: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: 14,
          color: 'var(--color-text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span style={{ color: '#22c55e', fontWeight: 600 }}>✓</span>
        Confirmar asistencia
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={isLoading}
        onClick={() => onSelect('no_show')}
        style={{
          width: '100%',
          padding: '10px 16px',
          textAlign: 'left',
          border: 'none',
          background: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: 14,
          color: 'var(--color-text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span style={{ color: '#ef4444', fontWeight: 600 }}>✗</span>
        Marcar no-show
      </button>
      <div style={{ borderTop: '1px solid var(--color-border)' }} />
      <button
        type="button"
        role="menuitem"
        onClick={onClose}
        style={{
          width: '100%',
          padding: '10px 16px',
          textAlign: 'left',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        Cerrar
      </button>
    </div>
  )
}

// ─── Vista Día: lista vertical de turnos ─────────────────────────────────────
// El time-grid de react-big-calendar es ilegible cuando hay múltiples
// profesionales con solapamiento. Esta lista ordena los turnos
// cronológicamente y muestra toda la información en un card legible.

// Item unificado de la timeline del día: turno ocupado o hueco libre.
// `sortKey` es el timestamp (ms) usado para intercalar cronológicamente
// libres y ocupados en la misma línea de tiempo.
type DayItem =
  | { kind: 'event'; sortKey: number; event: CalendarEvent }
  | { kind: 'free'; sortKey: number; shift: AvailabilityShift }

function DayListView({
  events,
  date,
  onReschedule,
  freeShifts,
  showProfessionalName,
  onFreeSlotClick,
}: {
  events: CalendarEvent[]
  date: string
  onReschedule?: (appointment: Appointment) => void
  freeShifts?: AvailabilityShift[]
  showProfessionalName?: boolean
  onFreeSlotClick?: (shift: AvailabilityShift) => void
}) {
  const queryClient = useQueryClient()

  // Lista unificada ordenada cronológicamente — turnos ocupados + huecos libres.
  // Para ordenar usamos el timestamp UTC (event.start ya es Date; el shift se
  // parsea con parseISO sobre slot_start_iso, que es UTC con Z).
  const items: DayItem[] = [
    ...events.map((event): DayItem => ({ kind: 'event', sortKey: event.start.getTime(), event })),
    ...(freeShifts ?? []).map((shift): DayItem => ({
      kind: 'free',
      sortKey: parseISO(shift.slot_start_iso).getTime(),
      shift,
    })),
  ].sort((a, b) => a.sortKey - b.sortKey)

  // Estado para modal de cancelación
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Estado para dropdown de asistencia (almacena appointment_id del abierto)
  const [attendanceOpenId, setAttendanceOpenId] = useState<string | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  async function handleUpdateStatus(
    appointmentId: string,
    status: 'cancelled' | 'completed' | 'no_show'
  ) {
    const response = await fetch(`/api/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Error al actualizar el turno')
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      await handleUpdateStatus(cancelTarget.appointment_id, 'cancelled')
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      setCancelTarget(null)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar el turno')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleAttendanceSelect(
    appointment: Appointment,
    status: 'completed' | 'no_show'
  ) {
    setAttendanceLoading(true)
    try {
      await handleUpdateStatus(appointment.appointment_id, status)
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      setAttendanceOpenId(null)
    } catch {
      // silently close — error se puede mejorar en siguiente iteración
      setAttendanceOpenId(null)
    } finally {
      setAttendanceLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '64px 0',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 14,
        }}
      >
        Sin turnos para este día
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
        {items.map((item, idx) => {
          if (item.kind === 'free') {
            const shift = item.shift
            return (
              <button
                key={`free-${shift.slot_start_iso}-${shift.professional_id}-${shift.service_id}-${idx}`}
                type="button"
                onClick={() => onFreeSlotClick?.(shift)}
                aria-label={`Agendar a las ${shift.open} con ${shift.professional_name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 16px',
                  width: '100%',
                  textAlign: 'left',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 8,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  opacity: 0.85,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ minWidth: 88, flexShrink: 0, fontSize: 14, fontWeight: 600 }}>
                  {shift.open}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  + Libre
                  {showProfessionalName && (
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {' · '}
                      {shift.professional_name}
                    </span>
                  )}
                </div>
              </button>
            )
          }

          const event = item.event
          const color = getEventColor(event.resource.status)
          const isCancelled = event.resource.status === 'cancelled'
          const profName =
            event.resource.professionals?.name ??
            event.resource.services?.professional_name ??
            null
          const serviceName = event.resource.services?.name ?? null
          const patientName = event.resource.patients?.full_name ?? 'Paciente'
          const patientId = event.resource.patient_id
          const isAttendanceOpen = attendanceOpenId === event.resource.appointment_id

          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                backgroundColor: `${color}12`,
                borderLeft: `4px solid ${color}`,
                borderRadius: '0 8px 8px 0',
                opacity: isCancelled ? 0.6 : 1,
              }}
            >
              {/* Horario */}
              <div style={{ minWidth: 88, flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color,
                    lineHeight: 1.3,
                  }}
                >
                  {format(event.start, 'HH:mm')}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.3,
                  }}
                >
                  {format(event.end, 'HH:mm')}
                </div>
              </div>

              {/* Paciente + servicio + profesional */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Feature D: nombre del paciente como link */}
                {patientId ? (
                  <Link
                    href={`/pacientes/${patientId}`}
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-interactive)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.4,
                      display: 'block',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                    aria-label={`Ver ficha de ${patientName}`}
                  >
                    {patientName}
                  </Link>
                ) : (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {patientName}
                  </div>
                )}
                {(serviceName ?? profName) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    {[serviceName, profName].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ marginTop: 4 }}>
                  <ReminderBadge
                    reminderSentAt={event.resource.reminder_sent_at}
                    attendanceConfirmed={event.resource.attendance_confirmed}
                  />
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, position: 'relative' }}>
                {/* Feature C: botón de asistencia (reloj) → dropdown */}
                {!isCancelled && (
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setAttendanceOpenId(
                          isAttendanceOpen ? null : event.resource.appointment_id
                        )
                      }
                      style={{
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                      aria-label={`Marcar asistencia de ${patientName}`}
                      aria-haspopup="menu"
                      aria-expanded={isAttendanceOpen}
                      title="Marcar asistencia"
                    >
                      <Clock style={{ width: 15, height: 15 }} />
                    </button>
                    {isAttendanceOpen && (
                      <AttendanceDropdown
                        patientName={patientName}
                        onSelect={(status) => handleAttendanceSelect(event.resource, status)}
                        onClose={() => setAttendanceOpenId(null)}
                        isLoading={attendanceLoading}
                      />
                    )}
                  </div>
                )}

                {/* Botón reprogramar */}
                {onReschedule && !isCancelled && (
                  <button
                    type="button"
                    onClick={() => onReschedule(event.resource)}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    aria-label={`Reprogramar turno de ${patientName}`}
                    title="Reprogramar"
                  >
                    <Pencil style={{ width: 15, height: 15 }} />
                  </button>
                )}

                {/* Feature B: botón cancelar (X) */}
                {!isCancelled && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null)
                      setCancelTarget(event.resource)
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                      e.currentTarget.style.color = '#ef4444'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none'
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                    }}
                    aria-label={`Cancelar turno de ${patientName}`}
                    title="Cancelar turno"
                  >
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de confirmación de cancelación */}
      {cancelTarget && (
        <CancelConfirmModal
          patientName={cancelTarget.patients?.full_name ?? 'Paciente'}
          onConfirm={handleCancelConfirm}
          onClose={() => { setCancelTarget(null); setCancelError(null) }}
          isLoading={cancelLoading}
        />
      )}

      {/* Error de cancelación (fuera del modal, visible en el listado) */}
      {cancelError && !cancelTarget && (
        <p role="alert" style={{ fontSize: 13, color: '#ef4444', marginTop: 8, textAlign: 'center' }}>
          {cancelError}
        </p>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface CalendarViewProps {
  date: string
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onReschedule?: (appointment: Appointment) => void
  // Story 10.7 — huecos libres del día (opcional, sin romper llamadas actuales)
  freeShifts?: AvailabilityShift[]
  showProfessionalName?: boolean
  onFreeSlotClick?: (shift: AvailabilityShift) => void
}

export function CalendarView({
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onReschedule,
  freeShifts,
  showProfessionalName,
  onFreeSlotClick,
}: CalendarViewProps) {
  if (isLoading) {
    return <AgendaDayViewSkeleton />
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
      >
        <p className="text-sm">Error al cargar los turnos</p>
        <button
          onClick={() => onRefetch()}
          className="min-h-[44px] px-4 text-sm text-[var(--color-interactive)] hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const events: CalendarEvent[] = appointments
    .filter((apt) => apt && apt.start_at && apt.end_at)
    .map(appointmentToCalendarEvent)

  return (
    <DayListView
      events={events}
      date={date}
      onReschedule={onReschedule}
      freeShifts={freeShifts}
      showProfessionalName={showProfessionalName}
      onFreeSlotClick={onFreeSlotClick}
    />
  )
}

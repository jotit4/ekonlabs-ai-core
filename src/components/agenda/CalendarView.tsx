'use client'

import { useState, useRef, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Pencil, X, Clock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  type Appointment,
  type CalendarEvent,
  appointmentToCalendarEvent,
  STATUS_LABELS,
} from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'
import { getServiceColor } from '@/lib/agenda/service-visuals'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'
import { AgendaDayViewSkeleton } from './AgendaDayView'
import { ReminderBadge } from './ReminderBadge'
import { SesionSerieBadge } from './SesionSerieBadge'
import { AbsenceDecisionDialog } from './AbsenceDecisionDialog'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'

// Nombre de profesional para agrupar/mostrar — mismo orden de fallback en
// turnos y huecos libres. 'Sin profesional' agrupa lo que no tiene asignado.
const NO_PROFESSIONAL_LABEL = 'Sin profesional'

function eventProfessionalName(event: CalendarEvent): string {
  return (
    event.resource.professionals?.name ??
    event.resource.services?.professional_name ??
    NO_PROFESSIONAL_LABEL
  )
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
  onFreeSlotClick,
}: {
  events: CalendarEvent[]
  date: string
  onReschedule?: (appointment: Appointment) => void
  freeShifts?: AvailabilityShift[]
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

  // Agrupar por profesional (cambio "agrupar por profesional"). El orden
  // cronológico se preserva dentro de cada grupo porque `items` ya viene
  // ordenado y recorremos en ese orden. Los grupos se ordenan alfabéticamente
  // por nombre de profesional para una salida estable.
  const groupsMap = new Map<string, DayItem[]>()
  for (const item of items) {
    const name =
      item.kind === 'event'
        ? eventProfessionalName(item.event)
        : item.shift.professional_name || NO_PROFESSIONAL_LABEL
    const bucket = groupsMap.get(name)
    if (bucket) bucket.push(item)
    else groupsMap.set(name, [item])
  }
  const groups = Array.from(groupsMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'es'),
  )

  // Estado para modal de cancelación
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Estado para dropdown de asistencia (almacena appointment_id del abierto)
  const [attendanceOpenId, setAttendanceOpenId] = useState<string | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // Story 13.6 — diálogo de decisión manual para turnos de serie (no_show / cancelled).
  const [absenceTarget, setAbsenceTarget] = useState<
    { appointment: Appointment; action: 'no_show' | 'cancelled' } | null
  >(null)
  const [absenceLoading, setAbsenceLoading] = useState(false)
  const [absenceError, setAbsenceError] = useState<string | null>(null)

  async function handleUpdateStatus(
    appointmentId: string,
    status: 'cancelled' | 'completed' | 'no_show',
    extra?: { decision: AbsenceDecision; note?: string }
  ) {
    const payload: { status: typeof status; decision?: AbsenceDecision; note?: string } = { status }
    if (extra) {
      payload.decision = extra.decision
      if (extra.note !== undefined) payload.note = extra.note
    }
    const response = await fetch(`/api/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Error al actualizar el turno')
    }
  }

  // Tras una decisión de serie, además de la agenda hay que refrescar el tracking
  // de la story 13.5 (contador de sesiones en la ficha del paciente).
  function invalidateTrackingQueries(patientId: string | null) {
    queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
    queryClient.invalidateQueries({ queryKey: ['treatments'], exact: false })
    if (patientId) {
      queryClient.invalidateQueries({ queryKey: ['treatments', 'by-patient', patientId] })
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    // Turno de serie → abrir el diálogo de decisión en lugar de cancelar directo.
    if (cancelTarget.package_id) {
      setAbsenceError(null)
      setAbsenceTarget({ appointment: cancelTarget, action: 'cancelled' })
      setCancelTarget(null)
      return
    }
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
    // Story 13.6 — no_show de un turno de serie → diálogo de decisión manual.
    // 'completed' (confirmar asistencia) NUNCA dispara el diálogo.
    if (status === 'no_show' && appointment.package_id) {
      setAbsenceError(null)
      setAbsenceTarget({ appointment, action: 'no_show' })
      setAttendanceOpenId(null)
      return
    }
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

  async function handleAbsenceConfirm(decision: AbsenceDecision, note?: string) {
    if (!absenceTarget) return
    setAbsenceLoading(true)
    setAbsenceError(null)
    try {
      await handleUpdateStatus(absenceTarget.appointment.appointment_id, absenceTarget.action, {
        decision,
        note,
      })
      invalidateTrackingQueries(absenceTarget.appointment.patient_id)
      setAbsenceTarget(null)
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Error al aplicar la decisión')
    } finally {
      setAbsenceLoading(false)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
        {groups.map(([profName, groupItems]) => (
          <div key={`group-${profName}`} role="group" aria-label={`Turnos de ${profName}`}>
            {/* Cabecera por profesional (cambio "agrupar por profesional") */}
            <h3
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                margin: '0 0 6px',
                padding: '4px 4px 6px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
              }}
            >
              {profName}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupItems.map((item, idx) => {
                if (item.kind === 'free') {
                  const shift = item.shift
                  // Tinte muy tenue del color del servicio para el hueco libre.
                  const svcColor = getServiceColor(shift.service_id)
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
                        border: `1px dashed ${svcColor}66`,
                        borderRadius: 8,
                        background: `${svcColor}08`,
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                        opacity: 0.85,
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${svcColor}14` }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = `${svcColor}08` }}
                    >
                      <div style={{ minWidth: 88, flexShrink: 0, fontSize: 14, fontWeight: 600 }}>
                        {shift.open}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                        + Libre
                        {shift.service_name && (
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {' · '}
                            {shift.service_name}
                          </span>
                        )}
                        {/* El profesional ya aparece en la cabecera del grupo;
                            evitamos duplicarlo en cada card. */}
                      </div>
                    </button>
                  )
                }

                const event = item.event
                // Color por SERVICIO (identidad). El estado se mantiene
                // distinguible vía StatusDot + label y la opacidad de cancelado.
                const color = getServiceColor(event.resource.service_id)
                const status = event.resource.status
                const isCancelled = status === 'cancelled'
                const profNameInner =
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
                      {(serviceName ?? profNameInner) && (
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
                          {[serviceName, profNameInner].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        {/* Badge de ESTADO — mantiene la semántica de estado al
                            margen del color de servicio (cancelado/no-show, etc.). */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <StatusDot variant={statusToVariant(status)} label={STATUS_LABELS[status]} />
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            {STATUS_LABELS[status]}
                          </span>
                        </span>
                        <ReminderBadge
                          reminderSentAt={event.resource.reminder_sent_at}
                          attendanceConfirmed={event.resource.attendance_confirmed}
                        />
                        <SesionSerieBadge
                          sessionIndex={event.resource.session_index}
                          totalSessions={event.resource.treatments?.total_sessions}
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
                              onSelect={(s) => handleAttendanceSelect(event.resource, s)}
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
          </div>
        ))}
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

      {/* Story 13.6 — diálogo de decisión manual para turnos de serie */}
      {absenceTarget && (
        <AbsenceDecisionDialog
          appointment={absenceTarget.appointment}
          action={absenceTarget.action}
          onConfirm={handleAbsenceConfirm}
          onClose={() => { setAbsenceTarget(null); setAbsenceError(null) }}
          isLoading={absenceLoading}
          error={absenceError}
        />
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
  // Aceptado por compatibilidad de la llamada actual; el profesional ahora se
  // muestra en la cabecera de cada grupo, así que este flag ya no se usa acá.
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
      onFreeSlotClick={onFreeSlotClick}
    />
  )
}

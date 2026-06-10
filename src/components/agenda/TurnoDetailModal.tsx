'use client'

import { Dialog } from '@base-ui/react/dialog'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { type Appointment, STATUS_LABELS } from '@/types/appointments'
import { ReminderBadge } from './ReminderBadge'
import { SessionNotePanel } from '@/components/paquetes/SessionNotePanel'

interface TurnoDetailModalProps {
  open: boolean
  appointment: Appointment | null
  onClose: () => void
  onReschedule: (appointment: Appointment) => void
}

export function TurnoDetailModal({
  open,
  appointment,
  onClose,
  onReschedule,
}: TurnoDetailModalProps) {
  const patientName = appointment?.patients?.full_name ?? 'Paciente'
  const serviceName = appointment?.services?.name ?? '-'
  const professionalName =
    appointment?.professionals?.name ??
    appointment?.services?.professional_name ??
    'Sin asignar'
  const statusLabel = appointment ? STATUS_LABELS[appointment.status] : '-'
  const fechaHora = appointment
    ? format(parseISO(appointment.start_at), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
    : ''

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="turno-detail-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-sm p-6 space-y-4">
            <Dialog.Title
              id="turno-detail-title"
              className="text-xl font-semibold text-[var(--color-text-primary)]"
            >
              {patientName}
            </Dialog.Title>

            <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
              <p className="capitalize text-[var(--color-text-secondary)]">{fechaHora}</p>
              <p>
                <span className="font-medium">Servicio: </span>
                {serviceName}
              </p>
              <p>
                <span className="font-medium">Profesional: </span>
                {professionalName}
              </p>
              <p>
                <span className="font-medium">Estado: </span>
                {statusLabel}
              </p>
              {appointment && (
                <ReminderBadge
                  reminderSentAt={appointment.reminder_sent_at}
                  attendanceConfirmed={appointment.attendance_confirmed}
                />
              )}
            </div>

            {/* Evolución de la sesión (Story 14.3 — HCE): el panel se auto-gatea
                por rol (null si no doctor/admin) — sin lógica de rol acá.
                Cubre turnos de serie (badge Sesión X/N) y turnos sueltos. */}
            {appointment && (
              <SessionNotePanel
                appointmentId={appointment.appointment_id}
                sessionIndex={appointment.session_index}
                totalSessions={appointment.treatments?.total_sessions}
              />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close
                aria-label="Cerrar detalle del turno"
                onClick={onClose}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors',
                ].join(' ')}
              >
                Cerrar
              </Dialog.Close>
              <button
                type="button"
                onClick={() => appointment && onReschedule(appointment)}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'bg-[var(--color-interactive)] text-white',
                  'hover:opacity-90 transition-opacity',
                ].join(' ')}
              >
                Reprogramar
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

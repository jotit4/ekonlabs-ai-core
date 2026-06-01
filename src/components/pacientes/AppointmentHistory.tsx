'use client'

import { isPast, isFuture, compareDesc, compareAsc, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'
import { ReminderBadge } from '@/components/agenda/ReminderBadge'
import { STATUS_LABELS, type AppointmentStatus } from '@/types/appointments'
import type { SoftSyncStatus } from '@/hooks/use-soft-sync'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AppointmentForHistory {
  appointment_id: string
  start_at: string
  end_at: string
  status: AppointmentStatus
  reminder_sent_at: string | null
  attendance_confirmed: boolean | null
  services: {
    name: string
    professional_name: string | null
  } | null
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppointmentHistoryProps {
  appointments: AppointmentForHistory[] | undefined | null
  syncStatus?: SoftSyncStatus
}

// ─── Item individual ─────────────────────────────────────────────────────────

interface AppointmentItemProps {
  apt: AppointmentForHistory
}

function AppointmentItem({ apt }: AppointmentItemProps) {
  const fechaLabel = format(new Date(apt.start_at), "EEEE d 'de' MMMM yyyy", { locale: es })
  const horaLabel = format(new Date(apt.start_at), 'HH:mm', { locale: es })
  const serviceName = apt.services?.name ?? '—'
  const professionalName = apt.services?.professional_name ?? '—'
  const statusLabel = STATUS_LABELS[apt.status] ?? apt.status
  const dotVariant = statusToVariant(apt.status)

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 16px',
      }}
    >
      {/* Fecha y hora */}
      <div style={{ gridColumn: '1 / -1' }}>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            marginBottom: 2,
            textTransform: 'capitalize',
          }}
        >
          {fechaLabel}
        </p>
        <p style={{ fontSize: 15, fontWeight: 500 }}>{horaLabel}</p>
      </div>

      {/* Servicio */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
          Servicio
        </p>
        <p style={{ fontSize: 14 }}>{serviceName}</p>
      </div>

      {/* Profesional */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
          Profesional
        </p>
        <p style={{ fontSize: 14 }}>{professionalName}</p>
      </div>

      {/* Estado */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot variant={dotVariant} label={statusLabel} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{statusLabel}</span>
        </span>
        <ReminderBadge
          reminderSentAt={apt.reminder_sent_at}
          attendanceConfirmed={apt.attendance_confirmed}
        />
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AppointmentHistory({ appointments, syncStatus }: AppointmentHistoryProps) {
  const apts = appointments ?? []

  // Separar y ordenar: próximos primero (asc), históricos después (desc)
  const upcoming = apts
    .filter((a) => a.status !== 'cancelled' && isFuture(new Date(a.start_at)))
    .sort((a, b) => compareAsc(new Date(a.start_at), new Date(b.start_at)))

  const past = apts
    .filter((a) => a.status === 'cancelled' || isPast(new Date(a.start_at)))
    .sort((a, b) => compareDesc(new Date(a.start_at), new Date(b.start_at)))

  const hasUpcoming = upcoming.length > 0
  const hasPast = past.length > 0
  const isEmpty = !hasUpcoming && !hasPast

  return (
    <section aria-label="Historial de turnos">
      {/* Header de la sección */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Historial de turnos</h2>

        {/* Indicador de sincronización sutil — no bloquea la lista */}
        {syncStatus === 'pending' && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            aria-live="polite"
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                border: '2px solid rgba(0,0,0,0.15)',
                borderTopColor: 'var(--color-interactive, #0071e3)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
              aria-hidden="true"
            />
            Sincronizando...
          </span>
        )}

        {syncStatus === 'error' && (
          <span
            style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
            aria-live="polite"
          >
            Sincronización no disponible
          </span>
        )}
      </div>

      {/* Estado vacío */}
      {isEmpty && (
        <p
          style={{
            textAlign: 'center',
            fontSize: 15,
            color: 'var(--color-text-secondary)',
            padding: '32px 0',
          }}
        >
          Sin turnos registrados
        </p>
      )}

      {/* Próximos turnos */}
      {hasUpcoming && (
        <div style={{ marginBottom: hasPast ? 24 : 0 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}
          >
            Próximos turnos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map((apt) => (
              <AppointmentItem key={apt.appointment_id} apt={apt} />
            ))}
          </div>
        </div>
      )}

      {/* Separador visual cuando hay ambos */}
      {hasUpcoming && hasPast && (
        <hr
          style={{
            border: 'none',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            marginBottom: 16,
          }}
          aria-hidden="true"
        />
      )}

      {/* Turnos anteriores */}
      {hasPast && (
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}
          >
            Turnos anteriores
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map((apt) => (
              <AppointmentItem key={apt.appointment_id} apt={apt} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

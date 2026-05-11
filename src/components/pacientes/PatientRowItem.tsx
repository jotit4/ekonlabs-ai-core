'use client'

import { isPast, isFuture, compareDesc, compareAsc, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusDot } from '@/components/shared/StatusDot'
import type { StatusDotVariant } from '@/components/shared/StatusDot'
import type { Patient } from '@/types/patients'

// ─── Helpers ────────────────────────────────────────────────────────────────

type AppointmentSlim = {
  appointment_id: string
  start_at: string
  end_at: string
  status: string
}

type ThreadStateSlim = {
  status: 'active' | 'paused'
  paused_reason: string | null
}

function calcTurnos(appointments: AppointmentSlim[] | undefined | null): {
  lastTurno: string | null
  nextTurno: string | null
} {
  if (!appointments || appointments.length === 0) {
    return { lastTurno: null, nextTurno: null }
  }

  const past = appointments
    .filter(a => a.status !== 'cancelled' && isPast(new Date(a.start_at)))
    .sort((a, b) => compareDesc(new Date(a.start_at), new Date(b.start_at)))

  const future = appointments
    .filter(a => a.status !== 'cancelled' && isFuture(new Date(a.start_at)))
    .sort((a, b) => compareAsc(new Date(a.start_at), new Date(b.start_at)))

  return {
    lastTurno: past[0]
      ? format(new Date(past[0].start_at), 'd MMM yyyy', { locale: es })
      : null,
    nextTurno: future[0]
      ? format(new Date(future[0].start_at), 'd MMM yyyy', { locale: es })
      : null,
  }
}

function patientStatusDot(
  state: ThreadStateSlim | null | undefined
): { variant: StatusDotVariant; label: string } {
  if (!state) return { variant: 'inactive', label: 'Sin conversación' }
  if (state.status === 'active') return { variant: 'active', label: 'IA activa' }
  if (state.paused_reason === 'human_takeover') return { variant: 'human', label: 'En control' }
  if (state.paused_reason === 'low_confidence') return { variant: 'warning', label: 'Necesita ayuda' }
  return { variant: 'warning', label: 'Pausada' }
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return fullName.slice(0, 2).toUpperCase()
}

// ─── Componente ─────────────────────────────────────────────────────────────

interface PatientRowItemProps {
  patient: Patient
  onClick: () => void
}

export function PatientRowItem({ patient, onClick }: PatientRowItemProps) {
  const { lastTurno, nextTurno } = calcTurnos(patient.appointments)
  const threadState = patient.thread_states?.[0] ?? null
  const { variant, label } = patientStatusDot(threadState)
  const initials = getInitials(patient.full_name)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter') {
      onClick()
    }
  }

  return (
    <tr
      role="row"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`Paciente: ${patient.full_name}, ${patient.phone_number}`}
      style={{
        cursor: 'pointer',
        transition: 'background-color 120ms ease',
      }}
      className="hover:bg-[#f5f5f7]"
    >
      {/* Avatar + Nombre/Teléfono */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>
                {patient.full_name}
              </p>
              {patient.deletion_requested_at && (
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  · Eliminación programada
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}
            >
              {patient.phone_number}
            </p>
          </div>
        </div>
      </td>

      {/* Obra social */}
      <td
        style={{
          padding: '12px 16px',
          fontSize: 15,
          color: 'var(--color-text-secondary)',
        }}
      >
        {patient.obra_social ?? '—'}
      </td>

      {/* Último turno */}
      <td
        style={{
          padding: '12px 16px',
          fontSize: 15,
          color: 'var(--color-text-secondary)',
        }}
      >
        {lastTurno ?? '—'}
      </td>

      {/* Próximo turno */}
      <td
        style={{
          padding: '12px 16px',
          fontSize: 15,
          color: 'var(--color-text-secondary)',
        }}
      >
        {nextTurno ?? '—'}
      </td>

      {/* Estado (StatusDot + label) */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot variant={variant} label={label} />
          <span
            style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}
          >
            {label}
          </span>
        </div>
      </td>
    </tr>
  )
}

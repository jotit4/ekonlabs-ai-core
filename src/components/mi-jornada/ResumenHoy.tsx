'use client'

import { useMemo } from 'react'
import { CheckCircle2, Clock, UserX } from 'lucide-react'
import type { Appointment } from '@/types/appointments'

// Los mismos estados que ProximosTurnos.tsx considera "fuera de cola de espera".
// No duplicamos la constante — copiamos la semántica documentada allí.
// completed → Atendidos  |  no_show → Ausencias  |  resto no-cancelado → Pendientes
const STATUS_ATENDIDO = 'completed' as const
const STATUS_AUSENCIA = 'no_show' as const
const STATUS_CANCELADO = 'cancelled' as const

export interface ResumenHoyProps {
  /** Array de turnos de hoy ya cargados en memoria (sin llamada API). */
  appointments: Appointment[]
}

/**
 * Tira "Resumen de hoy" — tres chips presentacionales derivados de los turnos
 * ya en memoria: Atendidos / Pendientes / Ausencias.
 *
 * Puramente presentacional: recibe `appointments`, no hace fetch, no usa hooks.
 * Reutiliza la clasificación de ProximosTurnos (STATUS_FUERA_DE_COLA).
 */
export function ResumenHoy({ appointments }: ResumenHoyProps) {
  const { atendidos, pendientes, ausencias } = useMemo(() => {
    let atendidos = 0
    let pendientes = 0
    let ausencias = 0

    for (const t of appointments) {
      if (t.status === STATUS_ATENDIDO) {
        atendidos++
      } else if (t.status === STATUS_AUSENCIA) {
        ausencias++
      } else if (t.status !== STATUS_CANCELADO) {
        // confirmed / pending / pending_calendar / rescheduled → sigue pendiente
        pendientes++
      }
    }

    return { atendidos, pendientes, ausencias }
  }, [appointments])

  return (
    <div
      role="region"
      aria-label="Resumen de hoy"
      className="mb-6 grid grid-cols-3 gap-3"
    >
      {/* ── Atendidos ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]"
        >
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <p
          className="text-[28px] font-bold leading-none tabular-nums text-[var(--color-status-ok)]"
          aria-label={`${atendidos} atendidos`}
        >
          {atendidos}
        </p>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Atendidos
        </p>
      </div>

      {/* ── Pendientes ────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]"
        >
          <Clock className="h-5 w-5" />
        </span>
        <p
          className="text-[28px] font-bold leading-none tabular-nums text-[var(--color-interactive)]"
          aria-label={`${pendientes} pendientes`}
        >
          {pendientes}
        </p>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Pendientes
        </p>
      </div>

      {/* ── Ausencias ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-status-warn)]/15 text-[var(--color-status-warn)]"
        >
          <UserX className="h-5 w-5" />
        </span>
        <p
          className="text-[28px] font-bold leading-none tabular-nums text-[var(--color-status-warn)]"
          aria-label={`${ausencias} ausencias`}
        >
          {ausencias}
        </p>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Ausencias
        </p>
      </div>
    </div>
  )
}

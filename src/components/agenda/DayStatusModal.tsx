'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DayStatusEntry } from '@/types/holidays'

// Modal "¿Este día está abierto o no?" (pedido literal del cliente ISADI
// 2026-07-14) — forma FÁCIL de decidir para una recepcionista no técnica: dos
// opciones claras, sin jerga, con confirmación visible de qué quedó elegido.
// Mismo modal sirve para un feriado nacional o para cerrar/reabrir a mano un
// día que NO es feriado (ej. corte de agua) — el payload es idéntico.
//
// Estilo visual: mismo lenguaje que `DayEventsModal` en
// CalendarViewRangeReadOnly.tsx (overlay + card, sin dependencia de una
// librería de Dialog — el repo no tiene una).

interface DayStatusModalProps {
  open: boolean
  /** Fecha ISO ('YYYY-MM-DD') del día que se está decidiendo. */
  date: string | null
  /** Estado actual del día (si ya es "especial") — `undefined` = día normal, sin decisión previa. */
  entry: DayStatusEntry | undefined
  onClose: () => void
  onDecide: (isOpen: boolean, reason?: string) => void
  isSaving?: boolean
}

export function DayStatusModal({ open, date, entry, onClose, onDecide, isSaving = false }: DayStatusModalProps) {
  const [reason, setReason] = useState('')

  // Limpiar el motivo cada vez que se abre el modal (o cambia la fecha) —
  // evita arrastrar el texto de una decisión anterior a la siguiente fecha.
  useEffect(() => {
    if (open) setReason('')
  }, [open, date])

  if (!open || !date) return null

  const dayLabel = format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const isHoliday = entry?.isHoliday ?? false
  const holidayName = entry?.holidayName ?? null
  const currentlyOpen = entry ? entry.effectiveOpen : true
  const hasDecision = entry != null && entry.decisionIsOpen !== null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Estado del día ${dayLabel}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--color-surface, #fff)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            textTransform: 'capitalize',
            margin: 0,
          }}
        >
          {dayLabel}
        </p>

        {isHoliday && holidayName && (
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-status-warn)',
              margin: '4px 0 0',
            }}
          >
            Feriado nacional: {holidayName}
          </p>
        )}

        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: '12px 0 0',
          }}
        >
          ¿Este día está abierto o no?
        </h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => onDecide(true, reason.trim() || undefined)}
            disabled={isSaving}
            aria-pressed={currentlyOpen}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 8,
              border: `2px solid ${currentlyOpen ? 'var(--color-status-ok)' : 'var(--color-border)'}`,
              background: currentlyOpen ? 'color-mix(in srgb, var(--color-status-ok) 16%, transparent)' : 'transparent',
              color: 'var(--color-text-primary)',
              fontWeight: 700,
              fontSize: 14,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Sí, abrimos
          </button>
          <button
            type="button"
            onClick={() => onDecide(false, reason.trim() || undefined)}
            disabled={isSaving}
            aria-pressed={!currentlyOpen}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 8,
              border: `2px solid ${!currentlyOpen ? 'var(--color-status-alert)' : 'var(--color-border)'}`,
              background: !currentlyOpen ? 'color-mix(in srgb, var(--color-status-alert) 16%, transparent)' : 'transparent',
              color: 'var(--color-text-primary)',
              fontWeight: 700,
              fontSize: 14,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            No, cerrado
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label
            htmlFor="day-status-reason"
            style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}
          >
            Motivo (opcional)
          </label>
          <input
            id="day-status-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Ej: corte de agua"
            style={{
              width: '100%',
              minHeight: 40,
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              padding: '0 10px',
              fontSize: 13,
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg)',
            }}
          />
        </div>

        {/* Confirmación visible de qué quedó elegido (pedido: "confirmación
            visible de qué quedó elegido" para una recepcionista no técnica). */}
        {hasDecision && entry && (
          <p role="status" style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Decidido por {entry.decidedByName ?? 'alguien del equipo'}
            {entry.decidedAt && !Number.isNaN(parseISO(entry.decidedAt).getTime())
              ? ` el ${format(parseISO(entry.decidedAt), 'd/MM/yyyy HH:mm')}`
              : ''}
            :{' '}
            <strong style={{ color: entry.effectiveOpen ? 'var(--color-status-ok)' : 'var(--color-status-alert)' }}>
              {entry.effectiveOpen ? 'Abre' : 'Cerrado'}
            </strong>
          </p>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: '0 16px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-interactive)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

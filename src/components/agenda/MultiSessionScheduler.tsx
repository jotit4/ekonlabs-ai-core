'use client'

import { useState } from 'react'
import { addDays, format, parseISO, isValid, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { AvailabilitySlotPicker, type SelectedSlot } from './AvailabilitySlotPicker'

// Motor REUTILIZABLE de selección MANUAL y ágil de N sesiones (bonos x5/x10).
// La recepcionista elige CADA horario a mano — nada es automático (reclamo ISADI:
// los pacientes faltan mucho, hay que decidir turno por turno). Lo único que hace
// la "cadencia" es ADELANTAR el calendario al próximo día probable tras cada
// elección, para no tener que navegar la fecha a mano. El horario siempre lo toca
// la persona. Se apoya en AvailabilitySlotPicker (disponibilidad REAL, RPC 029).

export type Cadence = 1 | 2 | 3 // veces por semana

// Días a saltar en el calendario tras elegir un hueco, según la cadencia.
const CADENCE_SKIP: Record<Cadence, number> = { 1: 7, 2: 3, 3: 2 }
const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 1, label: '1 vez/sem' },
  { value: 2, label: '2 veces/sem' },
  { value: 3, label: '3 veces/sem' },
]

interface MultiSessionSchedulerProps {
  serviceId: string
  professionalId: string
  /** Cantidad de sesiones a elegir (5, 10, o el cupo libre del bono). */
  total: number
  /** Sesiones ya elegidas (controlado por el padre). */
  selected: SelectedSlot[]
  onChange: (slots: SelectedSlot[]) => void
  /** Fecha mínima seleccionable (YYYY-MM-DD). Default: hoy. */
  minDate?: string
}

function fmtChosen(slot: SelectedSlot): string {
  const parsed = parseISO(slot.start_at)
  if (!isValid(parsed)) return `${slot.date} · ${slot.label}`
  return format(parsed, "EEEE d/MM · HH:mm", { locale: es })
}

// Avanza `skip` días saltando el fin de semana (cae en lunes si toca sáb/dom).
// SOLO mueve el calendario — no elige ni reserva nada.
function advanceDate(fromISO: string, skip: number): string {
  const base = parseISO(fromISO)
  if (!isValid(base)) return fromISO
  let d = addDays(base, skip)
  const day = getDay(d) // 0=domingo … 6=sábado
  if (day === 6) d = addDays(d, 2)
  else if (day === 0) d = addDays(d, 1)
  return format(d, 'yyyy-MM-dd')
}

export function MultiSessionScheduler({
  serviceId,
  professionalId,
  total,
  selected,
  onChange,
  minDate,
}: MultiSessionSchedulerProps) {
  const today = new Date().toLocaleDateString('en-CA')
  const floor = minDate ?? today
  const [date, setDate] = useState<string>('')
  const [cadence, setCadence] = useState<Cadence>(2)

  const count = selected.length
  const atCapacity = count >= total

  const handleToggle = (slot: SelectedSlot) => {
    const exists = selected.some((s) => s.start_at === slot.start_at)
    if (exists) {
      onChange(selected.filter((s) => s.start_at !== slot.start_at))
      return
    }
    // Tope: no elegir más que las N del bono.
    if (count >= total) return
    const next = [...selected, slot].sort((a, b) => a.start_at.localeCompare(b.start_at))
    onChange(next)
    // Auto-avance del calendario (solo navegación) al próximo día probable, para
    // que no haya que cambiar la fecha a mano. El horario lo elige la persona.
    if (next.length < total && date) {
      setDate(advanceDate(date, CADENCE_SKIP[cadence]))
    }
  }

  const handleRemove = (slot: SelectedSlot) => {
    onChange(selected.filter((s) => s.start_at !== slot.start_at))
  }

  return (
    <div className="space-y-3" data-testid="multi-session-scheduler">
      {/* Contador de progreso */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          Elegí {total} horarios ·{' '}
          <span className="tabular-nums" aria-label={`Vas ${count} de ${total}`}>
            {count}/{total}
          </span>
        </p>
        {atCapacity && (
          <span className="text-xs text-amber-700">Completaste las {total}</span>
        )}
      </div>

      {/* Cadencia — SOLO adelanta el calendario tras cada elección (no reserva) */}
      <div>
        <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
          Al elegir un horario, adelanto el calendario:
        </span>
        <div className="flex gap-2" role="group" aria-label="Cadencia">
          {CADENCE_OPTIONS.map((opt) => {
            const active = cadence === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setCadence(opt.value)}
                className={[
                  'px-3 py-1.5 rounded-[8px] border text-xs font-medium transition-colors',
                  active
                    ? 'bg-[var(--color-interactive)] text-white border-[var(--color-interactive)]'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selector de huecos reales (fecha controlada para el auto-avance) */}
      <AvailabilitySlotPicker
        serviceId={serviceId}
        professionalId={professionalId}
        selected={selected}
        onToggle={handleToggle}
        minDate={floor}
        date={date}
        onDateChange={setDate}
      />

      {/* Lista de sesiones elegidas, en orden */}
      {count > 0 && (
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            Sesiones elegidas ({count}/{total})
          </p>
          <ol role="list" className="space-y-1">
            {selected.map((s, i) => (
              <li
                key={s.start_at}
                className="flex items-center justify-between gap-2 text-sm text-[var(--color-text-primary)]"
              >
                <span>
                  <span className="text-[var(--color-text-secondary)] tabular-nums mr-2">
                    {i + 1}.
                  </span>
                  {fmtChosen(s)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(s)}
                  aria-label={`Quitar ${fmtChosen(s)}`}
                  className="text-xs font-medium text-red-600 hover:opacity-80"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

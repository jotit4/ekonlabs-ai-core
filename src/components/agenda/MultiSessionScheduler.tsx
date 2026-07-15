'use client'

import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { AvailabilitySlotPicker, type SelectedSlot } from './AvailabilitySlotPicker'
import { advanceDate } from '@/lib/agenda/advance-date'
import { fetchAvailabilityDays } from '@/hooks/use-availability'
import { proposeConsecutiveSessions } from '@/lib/treatments/propose-consecutive-sessions'
import type { AvailabilityShift, DayShifts } from '@/types/availability'

// Motor REUTILIZABLE de selección MANUAL y ágil de N sesiones (bonos x5/x10).
// La recepcionista elige CADA horario a mano — nada es automático por defecto
// (reclamo ISADI: los pacientes faltan mucho, hay que decidir turno por turno).
// Lo único que hace la "cadencia" es ADELANTAR el calendario al próximo día
// probable tras cada elección, para no tener que navegar la fecha a mano.
//
// Pedido B (ISADI 2026-07-14 — "agregar 5 y 10 sesiones... que se agende
// automático, un día atrás del otro"): se agregó "Proponer automáticamente",
// que SÍ pre-llena el resto de las fechas a partir de la primera elegida a
// mano (el ancla), reusando la disponibilidad real. DECISIÓN DEL CLIENTE:
// auto-propone, la secretaria ajusta — la propuesta queda 100% editable
// (mover/quitar cualquier sesión) y nada se agenda hasta confirmar (eso lo
// hace el componente padre, con el `selected` final). Un día sin hueco a la
// hora del ancla queda PENDIENTE (no se inventa un horario).
//
// Se apoya en AvailabilitySlotPicker (disponibilidad REAL, RPC 029).

export type Cadence = 1 | 2 | 3 | 4 // veces por semana, o 4 = todos los días

// Días a saltar en el calendario tras elegir un hueco, según la cadencia. La
// cadencia 4 ("todos los días") es la que pidió el cliente para pre-llenar
// bonos x5/x10 en días consecutivos — la clínica no atiende fin de semana, así
// que "todos los días" en la práctica es de lunes a viernes (advanceDate salta
// sábado/domingo).
const CADENCE_SKIP: Record<Cadence, number> = { 1: 7, 2: 3, 3: 2, 4: 1 }
const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 1, label: '1 vez/sem' },
  { value: 2, label: '2 veces/sem' },
  { value: 3, label: '3 veces/sem' },
  { value: 4, label: 'Todos los días' },
]

interface MultiSessionSchedulerProps {
  serviceId: string
  /** Profesional CONCRETO, o null = "cualquier profesional disponible" del servicio (Pedido A). */
  professionalId: string | null
  /** Cantidad de sesiones a elegir (5, 10, o el cupo libre del bono). */
  total: number
  /** Sesiones ya elegidas (controlado por el padre). */
  selected: SelectedSlot[]
  onChange: (slots: SelectedSlot[]) => void
  /** Fecha mínima seleccionable (YYYY-MM-DD). Default: hoy. */
  minDate?: string
}

// Identidad de un slot: compuesta (fecha+hora+profesional) en modo "cualquier
// profesional" (dos profesionales pueden compartir horario), simple (start_at)
// en modo profesional concreto — igual que AvailabilitySlotPicker, para que la
// dedup/exists/quitar sean consistentes en todo el flujo.
function slotIdentity(s: { start_at: string; professional_id?: string }, anyMode: boolean): string {
  return anyMode ? `${s.start_at}__${s.professional_id ?? ''}` : s.start_at
}

function fmtChosen(slot: SelectedSlot): string {
  const parsed = parseISO(slot.start_at)
  const base = !isValid(parsed) ? `${slot.date} · ${slot.label}` : format(parsed, "EEEE d/MM · HH:mm", { locale: es })
  return slot.professional_name ? `${base} · ${slot.professional_name}` : base
}

function fmtPendingDate(iso: string): string {
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return iso
  return format(parsed, "EEEE d/MM", { locale: es })
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
  // Default: si el bono es de 5 o 10 (el pedido explícito de días consecutivos
  // del cliente), arrancar en "Todos los días" — sigue siendo editable.
  const [cadence, setCadence] = useState<Cadence>(total === 5 || total === 10 ? 4 : 2)

  // Propuesta automática (Pedido B): fechas propuestas sin hueco a la hora del
  // ancla — quedan acá hasta que la recepcionista las resuelva a mano o las quite.
  const [pendingProposals, setPendingProposals] = useState<{ date: string }[]>([])
  const [isProposing, setIsProposing] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  const anyMode = professionalId === null
  const count = selected.length
  const atCapacity = count >= total
  const canPropose = total > 1 && count >= 1 && count < total

  const handleToggle = (slot: SelectedSlot) => {
    const exists = selected.some((s) => slotIdentity(s, anyMode) === slotIdentity(slot, anyMode))
    if (exists) {
      onChange(selected.filter((s) => slotIdentity(s, anyMode) !== slotIdentity(slot, anyMode)))
      return
    }
    // Tope: no elegir más que las N del bono.
    if (count >= total) return
    const next = [...selected, slot].sort((a, b) => a.start_at.localeCompare(b.start_at))
    onChange(next)
    // Un horario elegido a mano para una fecha que estaba pendiente la resuelve.
    setPendingProposals((prev) => prev.filter((p) => p.date !== slot.date))
    // Auto-avance del calendario (solo navegación) al próximo día probable, para
    // que no haya que cambiar la fecha a mano. El horario lo elige la persona.
    if (next.length < total && date) {
      setDate(advanceDate(date, CADENCE_SKIP[cadence]))
    }
  }

  const handleRemove = (slot: SelectedSlot) => {
    onChange(selected.filter((s) => slotIdentity(s, anyMode) !== slotIdentity(slot, anyMode)))
  }

  // "Proponer automáticamente" (Pedido B): toma la ÚLTIMA sesión elegida (el
  // ancla — normalmente la primera, si es la única) y propone el resto de las
  // fechas consecutivas (según la cadencia elegida arriba), consultando la
  // disponibilidad REAL de todo el rango en una sola llamada. Los días sin
  // hueco a la hora del ancla quedan PENDIENTES — nunca se inventa un horario.
  const handleAutoPropose = async () => {
    if (!canPropose) return
    const anchor = selected[selected.length - 1]
    const remaining = total - count
    const skip = CADENCE_SKIP[cadence]

    const dates: string[] = []
    let cursor = anchor.date
    for (let i = 0; i < remaining; i++) {
      cursor = advanceDate(cursor, skip)
      dates.push(cursor)
    }

    setIsProposing(true)
    setProposeError(null)
    try {
      const response = await fetchAvailabilityDays({
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        serviceId,
        professionalId: professionalId ?? undefined,
        allProfessionals: anyMode,
      })
      const daysMap = response.days as Record<string, DayShifts>
      const shiftsByDate: Record<string, AvailabilityShift[]> = {}
      for (const d of dates) {
        shiftsByDate[d] = daysMap[d]?.shifts ?? []
      }

      const proposal = proposeConsecutiveSessions({
        anchorDate: anchor.date,
        anchorLabel: anchor.label,
        anchorProfessionalId: anchor.professional_id,
        professionalId,
        remaining,
        skipDays: skip,
        shiftsByDate,
      })

      const resolved = proposal.filter((p) => p.slot != null).map((p) => p.slot as SelectedSlot)
      const pending = proposal.filter((p) => p.slot == null).map((p) => ({ date: p.date }))

      const merged = [...selected, ...resolved].sort((a, b) => a.start_at.localeCompare(b.start_at))
      onChange(merged)
      setPendingProposals(pending)
    } catch {
      setProposeError('No se pudo proponer las fechas automáticamente. Elegí manualmente.')
    } finally {
      setIsProposing(false)
    }
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

      {/* Cadencia — SOLO adelanta el calendario tras cada elección (no reserva);
          también es la que usa "Proponer automáticamente" para espaciar las fechas. */}
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

      {/* Propuesta automática (Pedido B — bonos x5/x10 en días consecutivos):
          disponible una vez elegido el primer horario a mano. */}
      {total > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleAutoPropose()}
            disabled={!canPropose || isProposing}
            className={[
              'px-3 py-2 rounded-[8px] border text-sm font-medium min-h-[40px] transition-colors',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-surface)]',
              !canPropose || isProposing ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {isProposing
              ? 'Proponiendo...'
              : Math.max(total - count, 0) === 1
                ? 'Proponer la próxima fecha'
                : `Proponer las próximas ${Math.max(total - count, 0)} fechas`}
          </button>
          {count === 0 && (
            <span className="text-xs text-[var(--color-text-secondary)]">
              Elegí el primer horario para proponer el resto
            </span>
          )}
        </div>
      )}
      {proposeError && (
        <p role="alert" className="text-xs text-red-600">
          {proposeError}
        </p>
      )}

      {/* Fechas propuestas sin hueco a la hora del ancla — quedan pendientes de
          elegir a mano (nunca se inventa un horario). */}
      {pendingProposals.length > 0 && (
        <div className="rounded-[8px] border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-800">
            Sin horario libre ese día — elegí uno a mano ({pendingProposals.length})
          </p>
          <ul role="list" aria-label="Fechas propuestas sin horario" className="space-y-1">
            {pendingProposals.map((p) => (
              <li key={p.date} className="flex items-center justify-between gap-2 text-sm text-amber-900">
                <span className="capitalize">{fmtPendingDate(p.date)}</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDate(p.date)}
                    className="text-xs font-medium text-[var(--color-interactive)] hover:underline"
                  >
                    Ver horarios
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingProposals((prev) => prev.filter((x) => x.date !== p.date))}
                    className="text-xs font-medium text-red-600 hover:opacity-80"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lista de sesiones elegidas, en orden */}
      {count > 0 && (
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            Sesiones elegidas ({count}/{total})
          </p>
          <ol role="list" className="space-y-1">
            {selected.map((s, i) => (
              <li
                key={slotIdentity(s, anyMode)}
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

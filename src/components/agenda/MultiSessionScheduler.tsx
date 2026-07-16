'use client'

import { useEffect, useRef, useState } from 'react'
import { differenceInCalendarDays, format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { AvailabilitySlotPicker, type SelectedSlot } from './AvailabilitySlotPicker'
import { advanceDate } from '@/lib/agenda/advance-date'
import { fetchAvailabilityDays } from '@/hooks/use-availability'
import { proposeConsecutiveSessions } from '@/lib/treatments/propose-consecutive-sessions'
import type { AvailabilityShift, DayShifts } from '@/types/availability'

// Motor REUTILIZABLE de selección de N sesiones (bonos x5/x10/N).
// La recepcionista elige la primera fecha+hora y el motor propone el resto con
// disponibilidad REAL. La propuesta sigue siendo editable y no reserva nada
// hasta que el componente padre confirma la selección.
//
// Ajuste ISADI 2026-07-16: ya no existe un segundo paso/botón "Proponer". Al
// elegir el primer horario se pre-llena automáticamente el resto. Un día sin
// hueco a la hora del ancla queda PENDIENTE (no se inventa un horario).
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
const MAX_AVAILABILITY_RANGE_DAYS = 60

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
  return !isValid(parsed) ? `${slot.date} · ${slot.label}` : format(parsed, "EEEE d/MM · HH:mm", { locale: es })
}

function fmtPendingDate(iso: string): string {
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return iso
  return format(parsed, "EEEE d/MM", { locale: es })
}

// /api/availability acepta como máximo 60 días inclusivos por request. Las
// fechas ya vienen ordenadas, así que partimos el rango sin perder ninguna.
function chunkDatesByRange(dates: string[]): { dateFrom: string; dateTo: string }[] {
  if (dates.length === 0) return []

  const ranges: { dateFrom: string; dateTo: string }[] = []
  let dateFrom = dates[0]
  let dateTo = dates[0]

  for (const candidate of dates.slice(1)) {
    if (differenceInCalendarDays(parseISO(candidate), parseISO(dateFrom)) >= MAX_AVAILABILITY_RANGE_DAYS) {
      ranges.push({ dateFrom, dateTo })
      dateFrom = candidate
    }
    dateTo = candidate
  }
  ranges.push({ dateFrom, dateTo })
  return ranges
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
  // ISADI pidió días consecutivos para cualquier cantidad de sesiones. La
  // cadencia sigue editable antes de elegir el ancla, pero el default es diario.
  const [cadence, setCadence] = useState<Cadence>(4)

  // Propuesta automática (Pedido B): fechas propuestas sin hueco a la hora del
  // ancla — quedan acá hasta que la recepcionista las resuelva a mano o las quite.
  const [pendingProposals, setPendingProposals] = useState<{ date: string }[]>([])
  const [proposeError, setProposeError] = useState<string | null>(null)
  const proposalRunRef = useRef(0)
  const selectedRef = useRef(selected)

  useEffect(() => {
    selectedRef.current = selected
    // El padre también puede limpiar la selección (p. ej. tras un 409). En ese
    // caso invalidamos cualquier respuesta en vuelo y retiramos pendientes viejos.
    if (selected.length === 0) {
      proposalRunRef.current += 1
    }
  }, [selected])

  useEffect(
    () => () => {
      // Cerrar/cambiar de flujo no debe permitir que una respuesta tardía
      // repueble el estado controlado del padre al reabrir.
      proposalRunRef.current += 1
    },
    [],
  )

  const anyMode = professionalId === null
  const count = selected.length
  const atCapacity = count >= total
  const handleToggle = (slot: SelectedSlot) => {
    const exists = selected.some((s) => slotIdentity(s, anyMode) === slotIdentity(slot, anyMode))
    if (exists) {
      const next = selected.filter((s) => slotIdentity(s, anyMode) !== slotIdentity(slot, anyMode))
      selectedRef.current = next
      onChange(next)
      if (next.length === 0) {
        proposalRunRef.current += 1
        setPendingProposals([])
        setProposeError(null)
      }
      return
    }
    // Tope: no elegir más que las N del bono.
    if (count >= total) return
    const next = [...selected, slot].sort((a, b) => a.start_at.localeCompare(b.start_at))
    if (selected.length === 0) {
      setPendingProposals([])
      setProposeError(null)
    }
    selectedRef.current = next
    onChange(next)
    // Un horario elegido a mano para una fecha que estaba pendiente la resuelve.
    setPendingProposals((prev) => prev.filter((p) => p.date !== slot.date))
    // Auto-avance del calendario (solo navegación) al próximo día probable, para
    // que no haya que cambiar la fecha a mano. El horario lo elige la persona.
    if (next.length < total && date) {
      setDate(advanceDate(date, CADENCE_SKIP[cadence]))
    }
    // La primera fecha+hora es el ancla: desde acá la propuesta ocurre sola,
    // sin botón ni estado "Proponiendo..." visible.
    if (selected.length === 0 && total > 1) {
      void handleAutoPropose(slot, next)
    }
  }

  const handleRemove = (slot: SelectedSlot) => {
    const next = selected.filter((s) => slotIdentity(s, anyMode) !== slotIdentity(slot, anyMode))
    selectedRef.current = next
    onChange(next)
    if (next.length === 0) {
      proposalRunRef.current += 1
      setPendingProposals([])
      setProposeError(null)
    }
  }

  // A partir del primer slot (ancla), propone automáticamente las fechas
  // siguientes en una única consulta. Un run-id evita que una respuesta tardía
  // reponga sesiones si la persona quitó/cambió el ancla mientras se consultaba.
  const handleAutoPropose = async (anchor: SelectedSlot, baseSelected: SelectedSlot[]) => {
    const remaining = total - baseSelected.length
    if (remaining <= 0) return
    const skip = CADENCE_SKIP[cadence]
    const runId = proposalRunRef.current + 1
    proposalRunRef.current = runId

    const dates: string[] = []
    let cursor = anchor.date
    for (let i = 0; i < remaining; i++) {
      cursor = advanceDate(cursor, skip)
      dates.push(cursor)
    }

    setProposeError(null)
    try {
      const responses = await Promise.all(
        chunkDatesByRange(dates).map(({ dateFrom, dateTo }) =>
          fetchAvailabilityDays({
            dateFrom,
            dateTo,
            serviceId,
            professionalId: professionalId ?? undefined,
            allProfessionals: anyMode,
          }),
        ),
      )
      const daysMap: Record<string, DayShifts> = {}
      for (const response of responses) {
        Object.assign(daysMap, response.days as Record<string, DayShifts>)
      }
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

      // La selección pudo editarse mientras llegaba la disponibilidad. Partimos
      // del estado más reciente y abortamos si el ancla ya fue quitada.
      if (proposalRunRef.current !== runId) return
      const current = selectedRef.current
      const anchorStillSelected = current.some(
        (slot) => slotIdentity(slot, anyMode) === slotIdentity(anchor, anyMode),
      )
      if (!anchorStillSelected) return

      const availableCapacity = Math.max(total - current.length, 0)
      const newResolved = resolved
        .filter(
          (candidate) =>
            !current.some(
              (slot) =>
                slot.date === candidate.date ||
                slotIdentity(slot, anyMode) === slotIdentity(candidate, anyMode),
            ),
        )
        .slice(0, availableCapacity)
      const merged = [...current, ...newResolved].sort((a, b) => a.start_at.localeCompare(b.start_at))
      selectedRef.current = merged
      onChange(merged)
      const resolvedDates = new Set(merged.map((slot) => slot.date))
      setPendingProposals(pending.filter((proposalDate) => !resolvedDates.has(proposalDate.date)))
    } catch {
      if (proposalRunRef.current === runId) {
        setProposeError('No se pudieron completar las fechas automáticamente. Elegí los horarios manualmente.')
      }
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

      {selected.length > 0 && proposeError && (
        <p role="alert" className="text-xs text-red-600">
          {proposeError}
        </p>
      )}

      {/* Fechas propuestas sin hueco a la hora del ancla — quedan pendientes de
          elegir a mano (nunca se inventa un horario). */}
      {selected.length > 0 && pendingProposals.length > 0 && (
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

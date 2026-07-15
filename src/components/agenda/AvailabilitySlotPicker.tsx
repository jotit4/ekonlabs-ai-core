'use client'

import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAvailability } from '@/hooks/use-availability'
import type { AvailabilityShift } from '@/types/availability'

// Selector de horarios POR DISPONIBILIDAD REAL — módulo REUTILIZABLE.
// Muestra los huecos libres (RPC `check_clinic_availability` / 029, vía
// `useAvailability`) de UNA fecha para un profesional+servicio dados, y deja
// elegir uno o varios. Pensado para reusarse en el "Agendar sesión" de paquetes
// y en el futuro selector por disponibilidad del NewTurnoModal general (reclamo
// de horarios hardcodeados 08–19).
//
// Es un componente CONTROLADO: el padre es dueño de la lista elegida (`selected`)
// y recibe los toggles. Identifica cada slot por su `slot_start_iso` (único por
// fecha+hora+profesional) — salvo en modo "cualquier profesional" (ver abajo),
// donde la identidad es compuesta (fecha+hora+profesional) porque dos
// profesionales distintos pueden compartir el mismo horario libre ese día.

export interface SelectedSlot {
  start_at: string // slot_start_iso (ISO UTC con Z)
  end_at: string // slot_end_iso
  date: string // 'YYYY-MM-DD' de la fecha elegida (para agrupar/mostrar)
  label: string // 'HH:MM' local BA (display)
  // Presentes cuando el slot viene de un hueco real (siempre, en la práctica) —
  // opcionales para no romper fixtures/tests viejos que no los incluían.
  // Usados en modo "cualquier profesional" (Pedido A #3 ISADI 2026-07-14) para
  // saber a quién quedó ligada cada sesión y para desambiguar identidad.
  professional_id?: string
  professional_name?: string
}

// Identidad de un slot: en modo "cualquier profesional" (professionalId=null)
// es compuesta (start_at + professional_id) porque dos profesionales pueden
// compartir horario; en modo profesional CONCRETO alcanza con start_at (todos
// los huecos devueltos son de ESE profesional) — así no se toca el
// comportamiento ya testeado de ese modo.
function slotIdentity(
  s: { start_at: string; professional_id?: string },
  anyMode: boolean,
): string {
  return anyMode ? `${s.start_at}__${s.professional_id ?? ''}` : s.start_at
}

interface AvailabilitySlotPickerProps {
  serviceId: string
  /** Profesional CONCRETO, o null = "cualquier profesional disponible" del servicio. */
  professionalId: string | null
  /** Slots ya elegidos (controlado por el padre), por `start_at`. */
  selected: SelectedSlot[]
  /** Alterna un slot en la selección del padre. */
  onToggle: (slot: SelectedSlot) => void
  /** Fecha mínima seleccionable (YYYY-MM-DD). Default: hoy. */
  minDate?: string
  /**
   * Fecha visible (YYYY-MM-DD) controlada por el padre. Si se pasa junto con
   * `onDateChange`, el padre es dueño de la fecha — necesario para el auto-avance
   * del `MultiSessionScheduler`. Si se omite, el picker usa estado interno
   * (comportamiento original).
   */
  date?: string
  onDateChange?: (date: string) => void
}

function fmtDateLong(iso: string): string {
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return iso
  return format(parsed, "EEEE d 'de' MMMM", { locale: es })
}

export function AvailabilitySlotPicker({
  serviceId,
  professionalId,
  selected,
  onToggle,
  minDate,
  date: dateProp,
  onDateChange,
}: AvailabilitySlotPickerProps) {
  const today = new Date().toLocaleDateString('en-CA')
  const floor = minDate ?? today
  // Fecha controlada por el padre (auto-avance) o estado interno (uso original).
  const [internalDate, setInternalDate] = useState<string>('')
  const isControlled = dateProp !== undefined && onDateChange !== undefined
  const date = isControlled ? dateProp : internalDate
  const setDate = isControlled ? onDateChange! : setInternalDate

  // professionalId === null es un estado VÁLIDO ("cualquier profesional
  // disponible" — Pedido A #3 ISADI 2026-07-14): no debe desactivar la consulta,
  // a diferencia de "todavía no elegido" (que en este componente nunca ocurre,
  // porque el padre siempre pasa un string concreto o null explícito).
  const anyMode = professionalId === null
  const enabled = !!serviceId && !!date

  const { shiftsForDate, isLoading, isError } = useAvailability({
    dateFrom: date || floor,
    dateTo: date || floor,
    serviceId,
    professionalId,
    allProfessionals: anyMode,
    enabled,
  })

  const shifts: AvailabilityShift[] = enabled ? shiftsForDate(date) : []
  const selectedKeys = new Set(selected.map((s) => slotIdentity(s, anyMode)))

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="slot-picker-date"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
        >
          Fecha
        </label>
        <input
          id="slot-picker-date"
          type="date"
          min={floor}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
        />
      </div>

      {enabled && (
        <div aria-live="polite">
          {isLoading && (
            <p role="status" className="text-sm text-[var(--color-text-secondary)]">
              Cargando horarios disponibles...
            </p>
          )}

          {isError && (
            <p role="alert" className="text-sm text-red-600">
              No se pudo cargar la disponibilidad. Probá de nuevo.
            </p>
          )}

          {!isLoading && !isError && shifts.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No hay horarios libres para {fmtDateLong(date)}.
            </p>
          )}

          {!isLoading && !isError && shifts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                Horarios libres — {fmtDateLong(date)}
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Horarios disponibles">
                {shifts.map((shift) => {
                  const isSelected = selectedKeys.has(
                    slotIdentity({ start_at: shift.slot_start_iso, professional_id: shift.professional_id }, anyMode),
                  )
                  return (
                    <button
                      key={`${shift.slot_start_iso}-${shift.professional_id}`}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        onToggle({
                          start_at: shift.slot_start_iso,
                          end_at: shift.slot_end_iso,
                          date,
                          label: shift.open,
                          professional_id: shift.professional_id,
                          professional_name: shift.professional_name,
                        })
                      }
                      className={[
                        'px-3 py-2 rounded-[8px] border text-sm font-medium min-h-[40px] transition-colors',
                        isSelected
                          ? 'bg-[var(--color-interactive)] text-white border-[var(--color-interactive)]'
                          : 'bg-[var(--color-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-surface)]',
                      ].join(' ')}
                    >
                      {/* Modo "cualquier profesional": mostrar a quién le tocaría ese
                          hueco (varios profesionales pueden compartir la misma hora). */}
                      {shift.open}
                      {anyMode ? ` · ${shift.professional_name}` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

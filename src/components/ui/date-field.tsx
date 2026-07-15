'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parse,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ── Constantes (español, independientes del locale del navegador) ─────────────

const ISO_FORMAT = 'yyyy-MM-dd'
const DISPLAY_FORMAT = 'dd/MM/yyyy'

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIso(value: string): Date | null {
  if (!value) return null
  const parsed = parse(value, ISO_FORMAT, new Date())
  return isValid(parsed) ? parsed : null
}

function toIso(date: Date): string {
  return format(date, ISO_FORMAT)
}

function toDisplay(date: Date): string {
  return format(date, DISPLAY_FORMAT)
}

/** Formatea dígitos crudos ("15031980") como borrador "dd/mm/aaaa". */
function formatDigitsAsDate(digits: string): string {
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  return [d, m, y].filter(Boolean).join('/')
}

function parseDisplay(text: string): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null
  const parsed = parse(text, DISPLAY_FORMAT, new Date())
  if (!isValid(parsed)) return null
  // date-fns es tolerante con overflow (ej. 31/02) y "corrige" a otro mes:
  // lo rechazamos explícitamente para no guardar una fecha distinta a la tipeada.
  if (format(parsed, DISPLAY_FORMAT) !== text) return null
  return parsed
}

function buildYearOptions(centerYear: number, spanBack: number, spanForward: number): number[] {
  const from = centerYear - spanBack
  const to = centerYear + spanForward
  const years: number[] = []
  for (let y = to; y >= from; y--) years.push(y)
  return years
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DateFieldProps {
  id?: string
  name?: string
  /** Fecha en formato ISO "yyyy-MM-dd", o cadena vacía. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  /** Fecha mínima seleccionable, formato ISO "yyyy-MM-dd". */
  minDate?: string
  /** Fecha máxima seleccionable, formato ISO "yyyy-MM-dd". */
  maxDate?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * Campo de fecha en formato español dd/mm/aaaa, con calendario clickeable.
 *
 * - Escritura manual: dígitos se autoformatean como "dd/mm/aaaa" (rápido para
 *   fechas lejanas como una fecha de nacimiento).
 * - Calendario: grilla de días navegable con mouse/touch y teclado (flechas,
 *   Home/End, RePág/AvPág para cambiar de mes), más selects de mes/año para
 *   saltar rápido a fechas lejanas.
 *
 * No usa `<input type="date">` nativo: ese input renderiza dd/mm o mm/dd según
 * el locale del navegador/SO, fuera de nuestro control vía HTML/CSS.
 */
export function DateField({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  minDate,
  maxDate,
  placeholder = 'dd/mm/aaaa',
  className,
  ...aria
}: DateFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  const selectedDate = useMemo(() => parseIso(value), [value])
  const minD = useMemo(() => (minDate ? parseIso(minDate) : null), [minDate])
  const maxD = useMemo(() => (maxDate ? parseIso(maxDate) : null), [maxDate])

  const [draft, setDraft] = useState(selectedDate ? toDisplay(selectedDate) : '')
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(selectedDate ?? new Date())
  const [focusedDate, setFocusedDate] = useState(selectedDate ?? new Date())
  const isFocusedRef = useRef(false)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  // Sincroniza el borrador de texto con el valor externo, salvo mientras se escribe.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(selectedDate ? toDisplay(selectedDate) : '')
    }
  }, [selectedDate])

  // Al abrir el calendario, centrarlo en la fecha seleccionada (o el día de foco actual).
  useEffect(() => {
    if (open) {
      const base = selectedDate ?? focusedDate
      setViewDate(base)
      setFocusedDate(base)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Mover el foco real del navegador al botón del día "activo" de la grilla.
  useEffect(() => {
    if (!open) return
    const key = toIso(focusedDate)
    buttonRefs.current.get(key)?.focus()
  }, [open, focusedDate])

  function isDisabledDate(date: Date): boolean {
    if (minD && isBefore(date, minD)) return true
    if (maxD && isAfter(date, maxD)) return true
    return false
  }

  function commitDate(date: Date) {
    if (isDisabledDate(date)) return
    const iso = toIso(date)
    setDraft(toDisplay(date))
    if (iso !== value) onChange(iso)
  }

  function commitDraft(raw: string) {
    const parsed = parseDisplay(raw)
    if (parsed && !isDisabledDate(parsed)) {
      commitDate(parsed)
    } else {
      // Entrada inválida, incompleta o fuera de rango → revertir al último valor válido
      setDraft(selectedDate ? toDisplay(selectedDate) : '')
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    const formatted = formatDigitsAsDate(digits)
    setDraft(formatted)
    if (digits.length === 8) commitDraft(formatted)
  }

  const monthStart = startOfMonth(viewDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const currentYear = new Date().getFullYear()
  const yearOptions = useMemo(
    () => buildYearOptions(selectedDate?.getFullYear() ?? currentYear, 100, 10),
    [selectedDate, currentYear]
  )

  function moveFocus(next: Date) {
    setFocusedDate(next)
    if (!isSameMonth(next, viewDate)) setViewDate(next)
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    }
    if (e.key in deltas) {
      e.preventDefault()
      const next = new Date(focusedDate)
      next.setDate(next.getDate() + deltas[e.key])
      moveFocus(next)
      return
    }
    if (e.key === 'PageUp') {
      e.preventDefault()
      const next = subMonths(focusedDate, 1)
      moveFocus(next)
      return
    }
    if (e.key === 'PageDown') {
      e.preventDefault()
      const next = addMonths(focusedDate, 1)
      moveFocus(next)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      moveFocus(startOfWeek(focusedDate, { weekStartsOn: 1 }))
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      moveFocus(endOfWeek(focusedDate, { weekStartsOn: 1 }))
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commitDate(focusedDate)
      setOpen(false)
    }
  }

  return (
    <div className={cn('flex items-stretch gap-1.5', className)}>
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={draft}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onChange={handleInputChange}
        onBlur={() => {
          isFocusedRef.current = false
          commitDraft(draft)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft(draft)
          }
        }}
        className={cn(
          'min-h-11 w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm tabular-nums text-[var(--color-text-primary)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
          'disabled:pointer-events-none disabled:opacity-50'
        )}
        {...aria}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          disabled={disabled}
          aria-label="Elegir fecha en el calendario"
          className={cn(
            'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-interactive)]',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
        </PopoverTrigger>

        <PopoverContent align="end" className="w-auto p-3">
          {/* Header: navegación de mes + selects rápidos de mes/año */}
          <div className="flex items-center justify-between gap-1 pb-2">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-1">
              <select
                aria-label="Mes"
                value={viewDate.getMonth()}
                onChange={(e) => setViewDate((d) => setMonth(d, Number(e.target.value)))}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>{name}</option>
                ))}
              </select>
              <select
                aria-label="Año"
                value={viewDate.getFullYear()}
                onChange={(e) => setViewDate((d) => setYear(d, Number(e.target.value)))}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Encabezado de días de la semana (lunes primero) */}
          <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div
                key={`${label}-${idx}`}
                className="flex size-11 items-center justify-center text-xs font-medium text-[var(--color-text-secondary)]"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grilla de días */}
          <div
            role="grid"
            aria-label="Calendario"
            className="grid grid-cols-7 gap-1"
            onKeyDown={handleGridKeyDown}
          >
            {days.map((day) => {
              const key = toIso(day)
              const outsideMonth = !isSameMonth(day, viewDate)
              const selected = selectedDate ? isSameDay(day, selectedDate) : false
              const isFocusTarget = isSameDay(day, focusedDate)
              const disabledDay = isDisabledDate(day)

              return (
                <button
                  key={key}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(key, el)
                    else buttonRefs.current.delete(key)
                  }}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-current={isToday(day) ? 'date' : undefined}
                  disabled={disabledDay}
                  tabIndex={isFocusTarget ? 0 : -1}
                  onClick={() => {
                    commitDate(day)
                    setOpen(false)
                  }}
                  onFocus={() => setFocusedDate(day)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                    outsideMonth && 'text-[var(--color-text-secondary)] opacity-50',
                    !outsideMonth && !selected && 'text-[var(--color-text-primary)]',
                    !selected && 'hover:bg-[var(--color-surface)]',
                    selected && 'bg-[var(--color-interactive)] text-white hover:bg-[var(--color-interactive)]',
                    isToday(day) && !selected && 'font-semibold underline underline-offset-2',
                    disabledDay && 'pointer-events-none opacity-30'
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

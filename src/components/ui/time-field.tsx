'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidTime(value: string): boolean {
  return TIME_RE.test(value)
}

/** Lista de horarios "redondos" entre minTime y maxTime, cada stepMinutes. */
function buildQuickTimes(minTime: string, maxTime: string, stepMinutes: number): string[] {
  if (!isValidTime(minTime) || !isValidTime(maxTime) || stepMinutes <= 0) return []

  const [minH, minM] = minTime.split(':').map(Number)
  const [maxH, maxM] = maxTime.split(':').map(Number)
  const start = minH * 60 + minM
  const end = maxH * 60 + maxM

  const times: string[] = []
  for (let minutes = start; minutes <= end; minutes += stepMinutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return times
}

/** Formatea dígitos crudos ("930") como borrador de hora ("09:30"). */
function formatDigitsAsTime(digits: string): string {
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TimeFieldProps {
  id?: string
  name?: string
  /** Hora en formato 24h "HH:mm", o cadena vacía. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  /** Límite inferior de la grilla de horarios rápidos (default 08:00). */
  minTime?: string
  /** Límite superior de la grilla de horarios rápidos (default 20:00). */
  maxTime?: string
  /** Paso entre horarios rápidos en minutos (default 30). */
  stepMinutes?: number
  placeholder?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * Campo de hora en formato 24h (nunca am/pm), pensado para uso táctil.
 *
 * - Escritura manual: el usuario tipea dígitos y se autoformatean como "HH:mm".
 * - Selección rápida: un botón de reloj abre una grilla de horarios habituales
 *   (por defecto la jornada de la clínica, 08:00 a 20:00 cada 30 minutos) con
 *   objetivos táctiles de 44px mínimo — pensado para elegir con el dedo.
 *
 * No usa `<input type="time">` nativo: ese input renderiza am/pm según el
 * locale del navegador y no se puede forzar a 24h vía HTML/CSS.
 */
export function TimeField({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  minTime = '08:00',
  maxTime = '20:00',
  stepMinutes = 30,
  placeholder = '--:--',
  className,
  ...aria
}: TimeFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const isFocusedRef = useRef(false)

  // Sincroniza el borrador con el valor externo, salvo mientras el usuario escribe.
  useEffect(() => {
    if (!isFocusedRef.current) setDraft(value)
  }, [value])

  const quickTimes = buildQuickTimes(minTime, maxTime, stepMinutes)

  function commit(raw: string) {
    if (isValidTime(raw)) {
      setDraft(raw)
      if (raw !== value) onChange(raw)
    } else {
      // Entrada inválida o incompleta → revertir al último valor válido conocido
      setDraft(value)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
    const formatted = formatDigitsAsTime(digits)
    setDraft(formatted)
    if (digits.length === 4) commit(formatted)
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
          commit(draft)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(draft)
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
          aria-label="Elegir un horario habitual de la lista"
          className={cn(
            'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-interactive)]',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          <Clock className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 max-h-72 overflow-y-auto p-2">
          <p className="px-1 pb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
            Horarios habituales
          </p>
          <div role="listbox" aria-label="Horarios habituales" className="grid grid-cols-3 gap-1">
            {quickTimes.map((t) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === value}
                onClick={() => {
                  commit(t)
                  setOpen(false)
                }}
                className={cn(
                  'min-h-11 rounded-md text-sm tabular-nums transition-colors',
                  t === value
                    ? 'bg-[var(--color-interactive)] text-white'
                    : 'bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

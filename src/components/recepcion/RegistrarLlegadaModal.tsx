'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

// Story 16.1 — mini-modal de "Registrar llegada" para la cola de orden de
// llegada. Busca al paciente reusando /api/patients/search (mismo patrón que
// NewTurnoModal: autobúsqueda por DNI 7-8 dígitos con debounce + Enter como
// fallback + auto-selección si hay 1 resultado). service_id y professional_id
// vienen FIJOS por props (los del servicio walk-in): el modal NO los elige.

const DNI_REGEX = /^\d{7,8}$/

interface PatientResult {
  patient_id: string
  full_name: string
  phone_number: string
  obra_social: string | null
  deletion_requested_at: string | null
}

interface RegistrarLlegadaModalProps {
  open: boolean
  onClose: () => void
  serviceId: string
  professionalId: string
  /** Se llama tras un alta exitosa (201) para refrescar la cola. */
  onRegistered: () => void
}

export function RegistrarLlegadaModal({
  open,
  onClose,
  serviceId,
  professionalId,
  onRegistered,
}: RegistrarLlegadaModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [q, setQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [results, setResults] = useState<PatientResult[] | null>(null)
  const [selected, setSelected] = useState<PatientResult | null>(null)
  const [lastSearched, setLastSearched] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // El modal se monta fresco cada vez que se abre (el padre lo renderiza sólo
  // con `open`), así que el estado inicial de useState ya es el "reset" — no
  // hace falta un effect que setee estado (evita react-hooks/set-state-in-effect).
  // Este effect sólo enfoca el campo de DNI al montar (sin setState).
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const performSearch = async (rawQuery: string) => {
    const query = rawQuery.trim()
    if (query.length < 2) {
      setSearchError('Ingresá al menos 2 caracteres para buscar')
      return
    }
    setLastSearched(query)
    setIsSearching(true)
    setSearchError(null)
    setResults(null)
    setSelected(null)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query)}`)
      const body = (await res.json()) as { patients?: PatientResult[]; error?: string }

      if (!res.ok) {
        setSearchError(body.error ?? 'Error al buscar pacientes. Intentá de nuevo.')
        return
      }

      const found = body.patients ?? []
      if (found.length === 0) {
        setSearchError(
          DNI_REGEX.test(query)
            ? `No hay ningún paciente con DNI ${query}.`
            : `Sin resultados para "${query}".`,
        )
        return
      }
      if (found.length === 1) {
        const one = found[0]
        if (one.deletion_requested_at) {
          setSearchError('Este paciente tiene una eliminación programada')
          return
        }
        setSelected(one)
        return
      }
      setResults(found)
    } catch {
      setSearchError('Error de red al buscar el paciente.')
    } finally {
      setIsSearching(false)
    }
  }

  // Autobúsqueda por DNI (7-8 dígitos) con debounce, sin apretar botón.
  useEffect(() => {
    const value = q.trim()
    if (!DNI_REGEX.test(value)) return
    if (value === lastSearched) return
    const timer = setTimeout(() => void performSearch(value), 300)
    return () => clearTimeout(timer)
    // performSearch usa setState estables; depende del valor tipeado y del dedup.
  }, [q, lastSearched])

  const handleSelect = (p: PatientResult) => {
    if (p.deletion_requested_at) {
      setSearchError('Este paciente tiene una eliminación programada')
      return
    }
    setSelected(p)
    setResults(null)
  }

  const handleRegister = async () => {
    if (!selected || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/appointments/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selected.patient_id,
          service_id: serviceId,
          professional_id: professionalId,
        }),
      })

      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setSubmitError(
          body.error === 'already_in_queue'
            ? 'Este paciente ya está en la cola.'
            : 'No se pudo registrar la llegada. Probá de nuevo.',
        )
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setSubmitError(body.error ?? 'No se pudo registrar la llegada.')
        return
      }

      onRegistered()
      onClose()
    } catch {
      setSubmitError('Error de red. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        data-testid="registrar-llegada-backdrop"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="registrar-llegada-title"
        className="relative z-10 w-full max-w-md rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 pb-4 pt-5">
          <div>
            <h2
              id="registrar-llegada-title"
              className="text-[18px] font-semibold text-[var(--color-text-primary)]"
            >
              Registrar llegada
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
              Buscá al paciente por DNI y anotalo en la cola.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void performSearch(q)
            }}
            noValidate
            aria-label="Buscar paciente por DNI"
          >
            <label
              htmlFor="walk-in-search-input"
              className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              DNI del paciente
            </label>
            <div className="relative">
              <input
                id="walk-in-search-input"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 30123456"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-h-[44px] w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
                aria-describedby={searchError ? 'walk-in-search-error' : undefined}
              />
              {isSearching && (
                <span
                  aria-live="polite"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]"
                >
                  Buscando…
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Ingresá los 7 u 8 dígitos y lo buscamos solo.
            </p>
            {searchError && (
              <p id="walk-in-search-error" role="alert" className="mt-1 text-xs text-red-600">
                {searchError}
              </p>
            )}
          </form>

          {/* Paciente seleccionado → confirmar alta */}
          {selected && (
            <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                ✓ {selected.full_name}
              </p>
              {selected.phone_number && (
                <p className="text-xs text-[var(--color-text-secondary)]">Tel: {selected.phone_number}</p>
              )}
              {submitError && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {submitError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleRegister()}
                disabled={isSubmitting}
                className={[
                  'mt-3 min-h-[44px] w-full rounded-[10px] px-4 text-sm font-semibold text-white transition-opacity',
                  'bg-[var(--color-status-ok)] hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-status-ok)]/30',
                  isSubmitting ? 'cursor-not-allowed opacity-50' : '',
                ].join(' ')}
              >
                {isSubmitting ? 'Anotando…' : 'Anotar en la cola'}
              </button>
            </div>
          )}

          {/* Múltiples resultados (fallback por nombre/teléfono) */}
          {results && results.length > 1 && !selected && (
            <div
              role="list"
              aria-label="Resultados de búsqueda"
              className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[10px] border border-[var(--color-border)]"
            >
              {results.map((p) => (
                <button
                  key={p.patient_id}
                  type="button"
                  role="listitem"
                  onClick={() => handleSelect(p)}
                  disabled={!!p.deletion_requested_at}
                  className={[
                    'w-full px-4 py-3 text-left text-sm transition-colors',
                    'bg-[var(--color-bg)] hover:bg-[var(--color-surface)]',
                    p.deletion_requested_at ? 'cursor-not-allowed opacity-50' : '',
                  ].join(' ')}
                >
                  <p className="font-medium text-[var(--color-text-primary)]">{p.full_name}</p>
                  {p.phone_number && (
                    <p className="text-[var(--color-text-secondary)]">Tel: {p.phone_number}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { formatISO, parseISO, addDays, isToday } from 'date-fns'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AgendaDayView } from '@/components/agenda/AgendaDayView'
import { useAgendaRealtime } from '@/hooks/use-agenda-realtime'

export default function AgendaPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const fechaParam = searchParams.get('fecha')
  const selectedDate = fechaParam ? parseISO(fechaParam) : new Date()
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  useAgendaRealtime(isoDate)

  const prevISO = formatISO(addDays(selectedDate, -1), { representation: 'date' })
  const nextISO = formatISO(addDays(selectedDate, 1), { representation: 'date' })
  const hoy = isToday(selectedDate)

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight capitalize">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </h1>
        </div>
        <nav
          className="flex items-center gap-1 mt-2"
          aria-label="Navegación de fecha"
        >
          <button
            onClick={() => router.push(`/agenda?fecha=${prevISO}`)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Día anterior"
          >
            ← Anterior
          </button>
          {!hoy && (
            <button
              onClick={() => router.push('/agenda')}
              className="min-h-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-interactive)]"
              aria-label="Ir a hoy"
            >
              Hoy
            </button>
          )}
          <button
            onClick={() => router.push(`/agenda?fecha=${nextISO}`)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Día siguiente"
          >
            Siguiente →
          </button>
        </nav>
      </header>
      <AgendaDayView date={isoDate} />
    </section>
  )
}

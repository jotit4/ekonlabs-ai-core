'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { formatISO, parseISO, addDays, isToday, isValid } from 'date-fns'
import { MiAgendaCalendarView } from '@/components/agenda/MiAgendaCalendarView'
import { useMyAgenda } from '@/hooks/use-my-agenda'
import { useMyAgendaRealtime } from '@/hooks/use-my-agenda-realtime'

function parseValidDate(str: string | null): Date {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date()
  const parsed = parseISO(str)
  return isValid(parsed) ? parsed : new Date()
}

export default function MiAgendaPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const selectedDate = parseValidDate(searchParams.get('fecha'))
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  useMyAgendaRealtime(isoDate)

  const { appointments, isPending, isError, errorStatus, refetch } = useMyAgenda(isoDate)

  const prevISO = formatISO(addDays(selectedDate, -1), { representation: 'date' })
  const nextISO = formatISO(addDays(selectedDate, 1), { representation: 'date' })
  const hoy = isToday(selectedDate)

  // Manejo de error 404 — el usuario no tiene perfil de profesional
  if (isError && errorStatus === 404) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="mb-6">
          <p className="text-sm text-[var(--color-text-secondary)]">Mi Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Mi Agenda</h1>
        </header>
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
        >
          <p className="text-sm text-center">
            No tenés un perfil de profesional configurado en el sistema. Contactá al administrador.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Mi Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Mi Agenda</h1>
        </div>
        <nav
          className="flex items-center gap-1 mt-2"
          aria-label="Navegación de fecha"
        >
          <button
            onClick={() => router.push(`/agenda/mi-agenda?fecha=${prevISO}`)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Día anterior"
          >
            ← Anterior
          </button>
          {!hoy && (
            <button
              onClick={() => router.push('/agenda/mi-agenda')}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-interactive)]"
              aria-label="Ir a hoy"
            >
              Hoy
            </button>
          )}
          <button
            onClick={() => router.push(`/agenda/mi-agenda?fecha=${nextISO}`)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Día siguiente"
          >
            Siguiente →
          </button>
        </nav>
      </header>
      <MiAgendaCalendarView
        date={isoDate}
        appointments={appointments}
        isLoading={isPending}
        isError={isError}
        onRefetch={refetch}
      />
    </section>
  )
}

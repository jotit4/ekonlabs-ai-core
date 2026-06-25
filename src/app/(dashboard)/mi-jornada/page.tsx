'use client'

import Link from 'next/link'
import { formatISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ArrowRight,
  Users,
} from 'lucide-react'
import { AgendaDayView } from '@/components/agenda/AgendaDayView'
import { ProximosTurnos } from '@/components/recepcion/ProximosTurnos'
import { ResumenHoy } from '@/components/mi-jornada/ResumenHoy'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useMyAgenda } from '@/hooks/use-my-agenda'
import { useMyAgendaRealtime } from '@/hooks/use-my-agenda-realtime'

// Pantalla de inicio del PROFESIONAL (kinesiólogo/médico). No administra ni
// opera el mostrador: entra directo a SU trabajo clínico del día.
// Reusa los mismos hooks que la Vista Dueño en su sección "mi agenda"
// (useMyAgenda + useMyAgendaRealtime) y el mismo componente de asistencia de
// un toque que el Modo recepción (ProximosTurnos).
export default function MiJornadaPage() {
  // Nombre de la persona logueada para el saludo. Mismo hook que el resto del
  // dashboard (recepción, vista dueño, perfil, etc.).
  const { user } = useCurrentUser()
  const primerNombre = user?.fullName ? user.fullName.trim().split(/\s+/)[0] : ''

  // Hoy, en formato YYYY-MM-DD local (mismo formato que usa la agenda).
  const hoyISO = formatISO(new Date(), { representation: 'date' })
  const hoyTexto = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const hoyTextoCapitalizado = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  // ── Mi agenda de hoy (turnos del profesional vinculado al usuario) ──────────
  // Realtime para que las llegadas/no-shows se reflejen sin recargar.
  useMyAgendaRealtime(hoyISO)
  const {
    appointments: misTurnos,
    isPending: miAgendaCargando,
    isError: miAgendaError,
    errorStatus: miAgendaStatus,
    refetch: recargarMiAgenda,
  } = useMyAgenda(hoyISO)

  // El usuario no tiene un profesional propio vinculado (no atiende turnos):
  // el endpoint responde 404. No es un error real — mostramos un estado amable.
  const sinAgendaPropia = miAgendaError && miAgendaStatus === 404

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      {/* ── Saludo personalizado ─────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="text-[14px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {hoyTextoCapitalizado}
        </p>
        <h1 className="mt-1.5 text-[34px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">
          {primerNombre ? (
            <>
              Hola, {primerNombre} <span aria-hidden="true">👋</span>
            </>
          ) : (
            <>
              Hola <span aria-hidden="true">👋</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-[16px] text-[var(--color-text-secondary)]">
          Esta es tu jornada de hoy.
        </p>
      </header>

      {/* ── Mi jornada de hoy (protagonista) ──────────────────────────────── */}
      <section aria-label="Mi jornada de hoy" className="mb-10">
        <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
          Mi jornada de hoy
        </h2>

        {sinAgendaPropia ? (
          // El usuario no tiene un profesional propio vinculado: no hay agenda
          // que mostrar. Estado vacío amable, sin alarma.
          <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-12 text-center">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-text-secondary)]/12 text-[var(--color-text-secondary)]"
            >
              <CalendarOff className="h-6 w-6" />
            </span>
            <p className="text-[16px] font-medium text-[var(--color-text-primary)]">
              Todavía no tenés una agenda propia
            </p>
            <p className="max-w-sm text-[13px] text-[var(--color-text-secondary)]">
              Cuando tu cuenta quede vinculada a un profesional, vas a ver acá
              los turnos de tu día.
            </p>
          </div>
        ) : (
          <>
            {/* ── Resumen de hoy — derivado de los turnos ya en memoria ─── */}
            <ResumenHoy appointments={misTurnos} />

            {/* Próximos turnos con CTA clínico: el nombre del paciente enlaza
                a /pacientes/[id]?tab=notas (rol doctor) gracias a Story A.
                Mismo componente que el Modo recepción pero con MI agenda. */}
            <div data-tour="mi-jornada-proximos">
              <ProximosTurnos
                appointments={misTurnos}
                hoyISO={hoyISO}
                isLoading={miAgendaCargando}
                isError={miAgendaError}
                onRetry={recargarMiAgenda}
              />
            </div>

            {/* Mi agenda completa del día, por si quiero ver más que los
                próximos 4 turnos. */}
            <div className="mt-8 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-semibold text-[var(--color-text-primary)]">
                  Todos mis turnos de hoy
                </h3>
                <Link
                  href="/agenda/mi-agenda"
                  className="flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
                >
                  Ver mi agenda completa
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
              <AgendaDayView
                date={hoyISO}
                appointments={misTurnos}
                isLoading={miAgendaCargando}
                isError={miAgendaError}
                onRefetch={recargarMiAgenda}
              />
            </div>
          </>
        )}
      </section>

      {/* ── Accesos clínicos rápidos ──────────────────────────────────────── */}
      <section aria-label="Accesos rápidos">
        <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
          Accesos rápidos
        </h2>
        <div data-tour="mi-jornada-accesos" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Mis pacientes — fichas clínicas, evolución, historial */}
          <Link
            href="/pacientes"
            className={[
              'group flex min-h-[44px] items-center gap-4 rounded-[18px] border p-5 text-left',
              'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
              'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
              'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-interactive)] text-white shadow-sm transition-transform group-hover:scale-105"
            >
              <Users className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                Mis pacientes
              </p>
              <p className="text-[13px] leading-snug text-[var(--color-text-secondary)]">
                Fichas clínicas, evoluciones e historial de turnos
              </p>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]"
            />
          </Link>

          {/* Mi disponibilidad */}
          <Link
            href="/mi-disponibilidad"
            className={[
              'group flex min-h-[44px] items-center gap-4 rounded-[18px] border p-5 text-left',
              'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
              'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
              'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-status-ok)] text-white shadow-sm transition-transform group-hover:scale-105"
            >
              <CalendarClock className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                Mi disponibilidad
              </p>
              <p className="text-[13px] leading-snug text-[var(--color-text-secondary)]">
                Configurá tus horarios y bloqueos de atención
              </p>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]"
            />
          </Link>

          {/* Mi agenda completa */}
          <Link
            href="/agenda/mi-agenda"
            className={[
              'group flex min-h-[44px] items-center gap-4 rounded-[18px] border p-5 text-left',
              'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
              'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
              'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-text-secondary)]/20 text-[var(--color-text-primary)] shadow-sm transition-transform group-hover:scale-105"
            >
              <CalendarDays className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                Mi agenda completa
              </p>
              <p className="text-[13px] leading-snug text-[var(--color-text-secondary)]">
                Semana entera y próximos días
              </p>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]"
            />
          </Link>
        </div>
      </section>
    </section>
  )
}

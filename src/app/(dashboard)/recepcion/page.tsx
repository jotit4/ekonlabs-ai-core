'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { formatISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarPlus,
  UserSearch,
  CalendarDays,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react'
import { NewTurnoModal } from '@/components/agenda/NewTurnoModal'
import { AgendaDayView } from '@/components/agenda/AgendaDayView'
import { ProximosTurnos } from '@/components/recepcion/ProximosTurnos'
import { useAppointments } from '@/hooks/use-appointments'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { ConversationSummary } from '@/types/conversations'

// Estados de una conversación que necesitan una persona: la IA pidió ayuda
// (needs_intervention) o alguien tomó el control manual (human_takeover).
// Reusamos exactamente el mismo criterio que la bandeja de Conversaciones.
const NECESITAN_PERSONA: ConversationSummary['status'][] = [
  'needs_intervention',
  'human_takeover',
]

// Mismo fetcher y misma queryKey que la bandeja (ConversationListSidebar):
// así compartimos la caché de React Query y el número que mostramos acá
// coincide siempre con el de la pantalla de Conversaciones.
async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new Error('Error al cargar conversaciones')
  const json = (await res.json()) as { conversations: ConversationSummary[] }
  return json.conversations
}

export default function RecepcionPage() {
  const router = useRouter()

  // Nombre de la persona logueada para el saludo. Mismo hook que usa el resto
  // del dashboard (TakeoverBar, perfil, etc.).
  const { user } = useCurrentUser()
  const primerNombre = user?.fullName ? user.fullName.trim().split(/\s+/)[0] : ''

  // Hoy, en formato YYYY-MM-DD local (mismo formato que usa la agenda).
  const hoyISO = formatISO(new Date(), { representation: 'date' })
  const hoyTexto = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const hoyTextoCapitalizado = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  // ── Conversaciones que necesitan una persona ────────────────────────────────
  // Reusamos la misma fuente de datos que la bandeja. El contador es REAL.
  const { data: conversaciones = [], isLoading: cargandoConversaciones } =
    useQuery<ConversationSummary[]>({
      queryKey: ['conversations', 'list', { status: 'all' }],
      queryFn: fetchConversations,
      staleTime: 30_000,
      refetchInterval: 30_000,
    })

  const cantidadNecesitanPersona = conversaciones.filter((c) =>
    NECESITAN_PERSONA.includes(c.status),
  ).length

  // ── Turnos de hoy (para el resumen y la agenda embebida) ────────────────────
  const {
    appointments: turnosDeHoy,
    isLoading: cargandoTurnos,
    isError: errorTurnos,
    refetch: recargarTurnos,
  } = useAppointments(hoyISO)

  // Turnos del día que cuentan como "agendados" (excluimos cancelados, que ya
  // no ocupan lugar). Y de esos, cuántos están confirmados.
  const turnosAgendados = turnosDeHoy.filter((t) => t.status !== 'cancelled')
  const cantidadTurnos = turnosAgendados.length
  const cantidadConfirmados = turnosAgendados.filter(
    (t) => t.status === 'confirmed',
  ).length

  // ── Modal de "Dar un turno" ─────────────────────────────────────────────────
  const [modalTurnoAbierto, setModalTurnoAbierto] = useState(false)

  // ── Mostrar / ocultar la agenda de hoy embebida ─────────────────────────────
  const [mostrarAgenda, setMostrarAgenda] = useState(false)

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      {/* ── Saludo personalizado ─────────────────────────────────────────── */}
      <header className="mb-7">
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
          ¿Qué querés hacer?
        </p>
      </header>

      {/* ── Resumen del día (stat chips con datos reales) ─────────────────── */}
      <div
        role="group"
        aria-label="Resumen de hoy"
        className="mb-8 flex flex-wrap items-stretch gap-3"
      >
        {/* Turnos de hoy */}
        <div className="flex min-h-[44px] flex-1 basis-[150px] items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]"
          >
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[20px] font-bold leading-none text-[var(--color-text-primary)]">
              {cargandoTurnos ? '—' : cantidadTurnos}
            </p>
            <p className="mt-1 text-[13px] leading-tight text-[var(--color-text-secondary)]">
              {cantidadTurnos === 1 ? 'turno hoy' : 'turnos hoy'}
            </p>
          </div>
        </div>

        {/* Confirmados */}
        <div className="flex min-h-[44px] flex-1 basis-[150px] items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]"
          >
            <CalendarCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[20px] font-bold leading-none text-[var(--color-text-primary)]">
              {cargandoTurnos ? '—' : cantidadConfirmados}
            </p>
            <p className="mt-1 text-[13px] leading-tight text-[var(--color-text-secondary)]">
              {cantidadConfirmados === 1 ? 'confirmado' : 'confirmados'}
            </p>
          </div>
        </div>

        {/* Conversaciones que necesitan una persona */}
        <Link
          data-tour="recepcion-conversaciones"
          href="/conversaciones"
          aria-label={
            cantidadNecesitanPersona > 0
              ? `${cantidadNecesitanPersona} ${
                  cantidadNecesitanPersona === 1
                    ? 'conversación necesita'
                    : 'conversaciones necesitan'
                } tu atención. Tocá para verlas.`
              : 'Conversaciones. Por ahora ninguna necesita tu atención.'
          }
          className={[
            'flex min-h-[44px] flex-1 basis-[150px] items-center gap-3 rounded-[14px] border px-4 py-3',
            'transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
            cantidadNecesitanPersona > 0
              ? 'border-[var(--color-status-warn)]/40 bg-[var(--color-status-warn)]/12 hover:bg-[var(--color-status-warn)]/20'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-interactive)]',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              cantidadNecesitanPersona > 0
                ? 'bg-[var(--color-status-warn)] text-white'
                : 'bg-[var(--color-text-secondary)]/12 text-[var(--color-text-secondary)]',
            ].join(' ')}
          >
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[20px] font-bold leading-none text-[var(--color-text-primary)]">
              {cargandoConversaciones ? '—' : cantidadNecesitanPersona}
            </p>
            <p className="mt-1 text-[13px] leading-tight text-[var(--color-text-secondary)]">
              {cantidadNecesitanPersona === 1
                ? 'te necesita'
                : 'te necesitan'}
            </p>
          </div>
        </Link>
      </div>

      {/* ── Franja destacada: conversaciones que te necesitan ─────────────── */}
      <Link
        href="/conversaciones"
        aria-label={
          cantidadNecesitanPersona > 0
            ? `Tenés ${cantidadNecesitanPersona} ${
                cantidadNecesitanPersona === 1 ? 'conversación' : 'conversaciones'
              } esperando que las atiendas. Tocá para verlas.`
            : 'Ver las conversaciones. Por ahora no hay ninguna esperando.'
        }
        className={[
          'mb-8 flex items-center gap-4 rounded-[18px] border px-6 py-5',
          'min-h-[44px] shadow-sm transition-all',
          'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
          cantidadNecesitanPersona > 0
            ? 'border-[var(--color-status-warn)]/40 bg-[var(--color-status-warn)]/12 hover:-translate-y-0.5 hover:shadow-md'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-interactive)] hover:shadow-md',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
            cantidadNecesitanPersona > 0
              ? 'bg-[var(--color-status-warn)] text-white'
              : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-status-ok)]',
          ].join(' ')}
        >
          {cantidadNecesitanPersona > 0 ? (
            <MessageCircle className="h-7 w-7" />
          ) : (
            <CheckCircle2 className="h-7 w-7" />
          )}
        </span>
        <div className="flex-1">
          <p className="text-[19px] font-semibold text-[var(--color-text-primary)]">
            {cargandoConversaciones
              ? 'Buscando conversaciones…'
              : cantidadNecesitanPersona > 0
                ? `${cantidadNecesitanPersona} ${
                    cantidadNecesitanPersona === 1
                      ? 'conversación te necesita'
                      : 'conversaciones te necesitan'
                  }`
                : 'Estás al día con las conversaciones'}
          </p>
          <p className="mt-0.5 text-[14px] text-[var(--color-text-secondary)]">
            {cantidadNecesitanPersona > 0
              ? 'Tocá acá para verlas y responder'
              : 'No hay ninguna esperando una respuesta'}
          </p>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="h-6 w-6 shrink-0 text-[var(--color-text-secondary)]"
        />
      </Link>

      {/* ── 3 tarjetas grandes ───────────────────────────────────────────── */}
      <div
        data-tour="recepcion-acciones"
        role="group"
        aria-label="Acciones rápidas"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {/* 1 · Dar un turno */}
        <button
          type="button"
          onClick={() => setModalTurnoAbierto(true)}
          className={[
            'group flex min-h-[168px] flex-col items-start gap-3 rounded-[18px] border p-6 text-left',
            'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
            'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-interactive)] text-white shadow-sm transition-transform group-hover:scale-105"
          >
            <CalendarPlus className="h-7 w-7" />
          </span>
          <span className="text-[20px] font-semibold text-[var(--color-text-primary)]">
            Dar un turno
          </span>
          <span className="text-[14px] leading-snug text-[var(--color-text-secondary)]">
            Buscá a la persona y reservale un horario
          </span>
        </button>

        {/* 2 · Buscar paciente */}
        <Link
          href="/pacientes"
          className={[
            'group flex min-h-[168px] flex-col items-start gap-3 rounded-[18px] border p-6 text-left',
            'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
            'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-status-ok)] text-white shadow-sm transition-transform group-hover:scale-105"
          >
            <UserSearch className="h-7 w-7" />
          </span>
          <span className="text-[20px] font-semibold text-[var(--color-text-primary)]">
            Buscar paciente
          </span>
          <span className="text-[14px] leading-snug text-[var(--color-text-secondary)]">
            Encontrá los datos de una persona registrada
          </span>
        </Link>

        {/* 3 · Ver la agenda de hoy */}
        <button
          type="button"
          onClick={() => setMostrarAgenda((v) => !v)}
          aria-expanded={mostrarAgenda}
          aria-controls="agenda-de-hoy"
          className={[
            'group flex min-h-[168px] flex-col items-start gap-3 rounded-[18px] border p-6 text-left',
            'bg-[var(--color-surface)] shadow-sm',
            'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
            mostrarAgenda
              ? 'border-[var(--color-interactive)] ring-1 ring-[var(--color-interactive)]'
              : 'border-[var(--color-border)]',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-status-warn)] text-white shadow-sm transition-transform group-hover:scale-105"
          >
            <CalendarDays className="h-7 w-7" />
          </span>
          <span className="text-[20px] font-semibold text-[var(--color-text-primary)]">
            Ver la agenda de hoy
          </span>
          <span className="text-[14px] leading-snug text-[var(--color-text-secondary)]">
            {mostrarAgenda
              ? 'Tocá para esconder los turnos de hoy'
              : 'Mirá quién viene hoy y a qué hora'}
          </span>
        </button>
      </div>

      {/* ── Quién viene ahora (próximos turnos + asistencia de un toque) ───── */}
      <ProximosTurnos
        appointments={turnosDeHoy}
        hoyISO={hoyISO}
        isLoading={cargandoTurnos}
        isError={errorTurnos}
        onRetry={recargarTurnos}
      />

      {/* ── Agenda de hoy embebida (se abre/cierra desde la 3ª tarjeta) ───── */}
      {mostrarAgenda && (
        <div
          id="agenda-de-hoy"
          className="mt-8 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)]">
              Turnos de hoy
            </h2>
            <Link
              href="/agenda?vista=dia"
              className="flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
            >
              Abrir la agenda completa
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <AgendaDayView
            date={hoyISO}
            appointments={turnosDeHoy}
            isLoading={cargandoTurnos}
            isError={errorTurnos}
            onRefetch={recargarTurnos}
          />
        </div>
      )}

      {/* ── Modal "Dar un turno" — reusado tal cual de la agenda ──────────── */}
      {/* Pedido 1 (ISADI 2026-07-16): esta página ES la home de recepción, así
          que el modal arranca directo en modo simplificado (grupo
          Fisioterapia, sin elegir servicio ni profesional) — mismo criterio
          que /agenda para el rol receptionist. */}
      <NewTurnoModal
        open={modalTurnoAbierto}
        onClose={() => setModalTurnoAbierto(false)}
        date={hoyISO}
        isReceptionist
      />

      {/* ── Atajo discreto para abrir el panel completo ──────────────────── */}
      <p className="mt-10 text-center text-[13px] text-[var(--color-text-secondary)]">
        ¿Necesitás algo más?{' '}
        <button
          type="button"
          onClick={() => router.push('/agenda')}
          className="font-medium text-[var(--color-interactive)] hover:underline"
        >
          Ir al panel completo
        </button>
      </p>
    </section>
  )
}

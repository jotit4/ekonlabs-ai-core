'use client'

import Link from 'next/link'
import { startOfMonth } from 'date-fns'
import { formatISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import {
  CalendarDays,
  TrendingUp,
  UserX,
  UserPlus,
  Bot,
  BarChart3,
  Settings,
  ArrowRight,
  CalendarOff,
} from 'lucide-react'
import { AgendaDayView } from '@/components/agenda/AgendaDayView'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAppointments } from '@/hooks/use-appointments'
import { useClinicKPIs } from '@/hooks/use-clinic-kpis'
import { useAgentKPIs } from '@/hooks/use-agent-kpis'
import { useMyAgenda } from '@/hooks/use-my-agenda'
import { useMyAgendaRealtime } from '@/hooks/use-my-agenda-realtime'

const TZ = 'America/Argentina/Buenos_Aires'

// El "pulso del negocio" se mide sobre el mes en curso (desde el día 1 hasta
// ahora), igual que la pantalla de Métricas cuando no se aplica un filtro.
// Devolvemos el rango en ISO con zona horaria de Argentina para que coincida
// exactamente con lo que mostraría /metricas.
function rangoDelMes(): { desde: string; hasta: string } {
  const ahora = new Date()
  const ahoraArg = toZonedTime(ahora, TZ)
  const inicioMesArg = startOfMonth(ahoraArg)
  return {
    desde: formatInTimeZone(inicioMesArg, TZ, "yyyy-MM-dd'T'HH:mm:ssxxx"),
    hasta: formatInTimeZone(ahora, TZ, "yyyy-MM-dd'T'HH:mm:ssxxx"),
  }
}

export default function InicioPage() {
  // ── Saludo personalizado (mismo hook que el resto del dashboard) ────────────
  const { user } = useCurrentUser()
  const primerNombre = user?.fullName ? user.fullName.trim().split(/\s+/)[0] : ''

  // Hoy, en formato YYYY-MM-DD local (mismo formato que usa la agenda).
  const hoyISO = formatISO(new Date(), { representation: 'date' })
  const hoyTexto = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const hoyTextoCapitalizado = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  // ── Pulso del negocio (mismos endpoints que /metricas) ──────────────────────
  // Reusamos exactamente los hooks de la pantalla de Métricas, con el rango del
  // mes en curso. Así los números de acá coinciden con los de "Ver métricas".
  const { desde, hasta } = rangoDelMes()
  const { kpis: clinicKpis, isPending: clinicCargando } = useClinicKPIs({ desde, hasta })
  const { kpis: agentKpis, isPending: agentCargando } = useAgentKPIs({ desde, hasta })

  // "Turnos de hoy" a nivel clínica (todos los profesionales), igual que el
  // Modo recepción: se calcula desde la agenda del día, no del KPI mensual.
  const { appointments: turnosClinicaHoy, isLoading: turnosHoyCargando } =
    useAppointments(hoyISO)
  const cantidadTurnosHoy = turnosClinicaHoy.filter(
    (t) => t.status !== 'cancelled',
  ).length

  // De las conversaciones del agente: cuántas resolvió solo vs cuántas
  // necesitaron una persona. "Necesitó una persona" = escalaciones (takeovers).
  const totalConversaciones = agentKpis?.total_conversaciones ?? 0
  const necesitaronPersona = agentKpis?.escalaciones ?? 0
  const resolvioSolo = Math.max(totalConversaciones - necesitaronPersona, 0)

  // ── Mi agenda de hoy (turnos del profesional vinculado al usuario) ──────────
  useMyAgendaRealtime(hoyISO)
  const {
    appointments: misTurnos,
    isPending: miAgendaCargando,
    isError: miAgendaError,
    errorStatus: miAgendaStatus,
    refetch: recargarMiAgenda,
  } = useMyAgenda(hoyISO)

  // El usuario no tiene un profesional propio (es solo administrador, no atiende):
  // el endpoint responde 404. No es un error real — mostramos un estado amable.
  const sinAgendaPropia = miAgendaError && miAgendaStatus === 404

  const misTurnosVigentes = misTurnos.filter((t) => t.status !== 'cancelled')

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
          Este es el resumen de tu clínica hoy.
        </p>
      </header>

      {/* ── Cómo va la clínica ────────────────────────────────────────────── */}
      <section aria-label="Cómo va la clínica" className="mb-10">
        <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
          Cómo va la clínica
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Turnos de hoy */}
          <PulsoCard
            icono={<CalendarDays className="h-5 w-5" />}
            tono="interactive"
            valor={turnosHoyCargando ? '—' : cantidadTurnosHoy}
            titulo={cantidadTurnosHoy === 1 ? 'turno para hoy' : 'turnos para hoy'}
            ayuda="Reservados para todos los profesionales"
          />

          {/* Ocupación */}
          <PulsoCard
            icono={<TrendingUp className="h-5 w-5" />}
            tono="ok"
            valor={clinicCargando || !clinicKpis ? '—' : `${clinicKpis.ocupacion_pct}%`}
            titulo="de la agenda ocupada"
            ayuda="Este mes, sobre los horarios disponibles"
          />

          {/* Ausencias (no-shows) */}
          <PulsoCard
            icono={<UserX className="h-5 w-5" />}
            tono="warn"
            valor={clinicCargando || !clinicKpis ? '—' : clinicKpis.no_shows}
            titulo={
              clinicKpis?.no_shows === 1
                ? 'persona faltó al turno'
                : 'personas faltaron al turno'
            }
            ayuda="Este mes, sin avisar"
          />

          {/* Pacientes nuevos */}
          <PulsoCard
            icono={<UserPlus className="h-5 w-5" />}
            tono="interactive"
            valor={clinicCargando || !clinicKpis ? '—' : clinicKpis.pacientes_nuevos}
            titulo={
              clinicKpis?.pacientes_nuevos === 1
                ? 'paciente nuevo'
                : 'pacientes nuevos'
            }
            ayuda="Llegaron por primera vez este mes"
          />

          {/* El asistente de WhatsApp — resolvió solo vs necesitó una persona.
              Ocupa el ancho de dos columnas para que entre la frase completa. */}
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="flex min-h-[44px] h-full items-center gap-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]"
              >
                <Bot className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  El asistente de WhatsApp
                </p>
                {agentCargando ? (
                  <p className="mt-1 text-[14px] text-[var(--color-text-secondary)]">
                    Calculando…
                  </p>
                ) : totalConversaciones === 0 ? (
                  <p className="mt-1 text-[14px] text-[var(--color-text-secondary)]">
                    Todavía no atendió conversaciones este mes.
                  </p>
                ) : (
                  <p className="mt-1 text-[14px] leading-snug text-[var(--color-text-secondary)]">
                    Resolvió{' '}
                    <strong className="font-semibold text-[var(--color-status-ok)]">
                      {resolvioSolo}{' '}
                      {resolvioSolo === 1 ? 'conversación' : 'conversaciones'}
                    </strong>{' '}
                    sin ayuda
                    {necesitaronPersona > 0 ? (
                      <>
                        {' · '}
                        <strong className="font-semibold text-[var(--color-status-warn)]">
                          {necesitaronPersona}
                        </strong>{' '}
                        {necesitaronPersona === 1
                          ? 'necesitó una persona'
                          : 'necesitaron una persona'}
                      </>
                    ) : (
                      ' · ninguna necesitó una persona'
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mi agenda de hoy ──────────────────────────────────────────────── */}
      <section aria-label="Mi agenda de hoy" className="mb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Mi agenda de hoy
          </h2>
          {!sinAgendaPropia && misTurnosVigentes.length > 0 && (
            <Link
              href="/agenda/mi-agenda"
              className="flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
            >
              Ver mi agenda completa
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}
        </div>

        {sinAgendaPropia ? (
          // El usuario administra pero no atiende pacientes: no tiene agenda propia.
          <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-12 text-center">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-text-secondary)]/12 text-[var(--color-text-secondary)]"
            >
              <CalendarOff className="h-6 w-6" />
            </span>
            <p className="text-[16px] font-medium text-[var(--color-text-primary)]">
              No tenés una agenda propia
            </p>
            <p className="max-w-sm text-[13px] text-[var(--color-text-secondary)]">
              Tu cuenta administra la clínica pero no atiende turnos. Igual podés
              ver la agenda completa de todos los profesionales.
            </p>
            <Link
              href="/agenda?vista=dia"
              className="mt-1 flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
            >
              Ver la agenda de la clínica
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-sm">
            <AgendaDayView
              date={hoyISO}
              appointments={misTurnos}
              isLoading={miAgendaCargando}
              isError={miAgendaError}
              onRefetch={recargarMiAgenda}
            />
          </div>
        )}
      </section>

      {/* ── Accesos rápidos ───────────────────────────────────────────────── */}
      <section aria-label="Accesos rápidos">
        <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/metricas"
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
              <BarChart3 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                Ver métricas completas
              </p>
              <p className="text-[13px] leading-snug text-[var(--color-text-secondary)]">
                Números del mes, tendencias y servicios más pedidos
              </p>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]"
            />
          </Link>

          <Link
            href="/configuracion/agente"
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
              <Settings className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                Configuración
              </p>
              <p className="text-[13px] leading-snug text-[var(--color-text-secondary)]">
                Ajustá el asistente, los servicios y tu equipo
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

// ─── Tarjeta de un indicador del pulso ────────────────────────────────────────

type PulsoTono = 'interactive' | 'ok' | 'warn'

const TONO_CLASES: Record<PulsoTono, string> = {
  interactive: 'bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]',
  ok: 'bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]',
  warn: 'bg-[var(--color-status-warn)]/15 text-[var(--color-status-warn)]',
}

interface PulsoCardProps {
  icono: React.ReactNode
  tono: PulsoTono
  valor: number | string
  titulo: string
  ayuda: string
}

function PulsoCard({ icono, tono, valor, titulo, ayuda }: PulsoCardProps) {
  return (
    <div className="flex min-h-[44px] h-full items-center gap-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <span
        aria-hidden="true"
        className={[
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
          TONO_CLASES[tono],
        ].join(' ')}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <p className="text-[26px] font-bold leading-none text-[var(--color-text-primary)]">
          {valor}
        </p>
        <p className="mt-1.5 text-[14px] font-medium leading-tight text-[var(--color-text-primary)]">
          {titulo}
        </p>
        <p className="mt-0.5 text-[12px] leading-tight text-[var(--color-text-secondary)]">
          {ayuda}
        </p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Trash2, CheckCircle2, ArrowRight } from 'lucide-react'
import { useDeletionRequests } from '@/hooks/use-deletion-requests'
import type { ConversationSummary } from '@/types/conversations'

// Mismos estados que considera recepción al calcular las escaladas —
// mantener sincronizado con recepcion/page.tsx para que el número coincida.
const NECESITAN_PERSONA: ConversationSummary['status'][] = [
  'needs_intervention',
  'human_takeover',
]

// Mismo fetcher y misma queryKey que recepcion/page.tsx →
// React Query comparte la caché y el admin ve el mismo número que recepción.
async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new Error('Error al cargar conversaciones')
  const json = (await res.json()) as { conversations: ConversationSummary[] }
  return json.conversations
}

export function PendientesDelDueno() {
  // ── Fuente 1: conversaciones escaladas ────────────────────────────────────
  // Fail-soft: si falla, escaladas = 0 y la otra fuente sigue visible.
  const {
    data: conversaciones = [],
    isPending: cargandoConv,
    isError: errorConv,
  } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: fetchConversations,
    staleTime: 0,
    refetchInterval: 30_000,
  })

  // ── Fuente 2: solicitudes de supresión pendientes ─────────────────────────
  // Fail-soft: si falla, supresiones = 0 y la otra fuente sigue visible.
  const {
    requests,
    isPending: cargandoSup,
    isError: errorSup,
  } = useDeletionRequests()

  // Totales derivados (fail-soft: 0 si la fuente tiene error)
  const escaladas = errorConv
    ? 0
    : conversaciones.filter((c) => NECESITAN_PERSONA.includes(c.status)).length

  const supresiones = errorSup
    ? 0
    : requests.filter((r) => r.status === 'pending').length

  const cargando = cargandoConv || cargandoSup
  const hayAlgo = escaladas > 0 || supresiones > 0

  return (
    <section aria-label="Pendientes que te necesitan" className="mb-10">
      <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
        Pendientes que te necesitan
      </h2>

      {cargando ? (
        /* Estado de carga — ambas fuentes se resuelven en milisegundos */
        <div className="flex items-center gap-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 shadow-sm">
          <p className="text-[14px] text-[var(--color-text-secondary)]">Verificando…</p>
        </div>
      ) : !hayAlgo ? (
        /* Estado vacío "Estás al día" — patrón de recepcion/page.tsx:230-252 */
        <div className="flex items-center gap-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 shadow-sm">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-status-ok)]"
          >
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <p className="text-[19px] font-semibold text-[var(--color-text-primary)]">
              Estás al día
            </p>
            <p className="mt-0.5 text-[14px] text-[var(--color-text-secondary)]">
              No hay nada que requiera tu atención ahora
            </p>
          </div>
        </div>
      ) : (
        /* Lista de pendientes — una fila por fuente con pendientes */
        <div className="flex flex-col gap-3">
          {escaladas > 0 && (
            <Link
              href="/conversaciones"
              className={[
                'flex items-center gap-4 rounded-[18px] border px-6 py-5',
                'min-h-[44px] shadow-sm transition-all',
                'border-[var(--color-status-warn)]/40 bg-[var(--color-status-warn)]/12',
                'hover:-translate-y-0.5 hover:shadow-md',
                'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-status-warn)] text-white"
              >
                <MessageCircle className="h-7 w-7" />
              </span>
              <div className="flex-1">
                <p className="text-[19px] font-semibold text-[var(--color-text-primary)]">
                  {escaladas === 1
                    ? '1 conversación escalada'
                    : `${escaladas} conversaciones escaladas`}
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--color-text-secondary)]">
                  El asistente necesita que revises{' '}
                  {escaladas === 1 ? 'esta conversación' : 'estas conversaciones'}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-[var(--color-text-secondary)]"
              />
            </Link>
          )}

          {supresiones > 0 && (
            <Link
              href="/configuracion/supresion"
              className={[
                'flex items-center gap-4 rounded-[18px] border px-6 py-5',
                'min-h-[44px] shadow-sm transition-all',
                'border-[var(--color-status-warn)]/40 bg-[var(--color-status-warn)]/12',
                'hover:-translate-y-0.5 hover:shadow-md',
                'focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-status-warn)] text-white"
              >
                <Trash2 className="h-7 w-7" />
              </span>
              <div className="flex-1">
                <p className="text-[19px] font-semibold text-[var(--color-text-primary)]">
                  {supresiones === 1
                    ? '1 solicitud de supresión pendiente'
                    : `${supresiones} solicitudes de supresión pendientes`}
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--color-text-secondary)]">
                  {supresiones === 1
                    ? 'Un paciente pidió que borres sus datos'
                    : 'Pacientes que pidieron que borres sus datos'}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-[var(--color-text-secondary)]"
              />
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Clock, UserPlus } from 'lucide-react'
import { useWalkInQueue } from '@/hooks/use-walk-in-queue'
import { useUserRole } from '@/hooks/use-user-role'
import { patientFichaHref } from '@/lib/agenda/patient-ficha-href'
import { RegistrarLlegadaModal } from '@/components/recepcion/RegistrarLlegadaModal'
import type { Appointment } from '@/types/appointments'

// Story 16.1 — panel REUSABLE de la cola de orden de llegada (walk-in) de un
// servicio. La Story 16-2 lo monta también en la agenda del Dr/admin, por eso
// recibe serviceId/professionalId/hoyISO por props (nada hardcodeado).
interface ColaOrdenLlegadaProps {
  serviceId: string
  professionalId: string
  /** Fecha de hoy en YYYY-MM-DD (para la queryKey de la cola). */
  hoyISO: string
}

export function ColaOrdenLlegada({ serviceId, professionalId, hoyISO }: ColaOrdenLlegadaProps) {
  const { queue, isLoading, isError, refetch } = useWalkInQueue(hoyISO, serviceId)
  const [modalAbierto, setModalAbierto] = useState(false)

  const esperando = queue.length

  return (
    <section className="mt-10" aria-label="Cola de orden de llegada">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Cola de orden de llegada
          </h2>
          <span
            aria-label={`${esperando} ${esperando === 1 ? 'persona esperando' : 'personas esperando'}`}
            className="inline-flex min-h-[24px] items-center rounded-full bg-[var(--color-interactive)]/12 px-2.5 text-[13px] font-semibold text-[var(--color-interactive)]"
          >
            {esperando} esperando
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-[var(--color-interactive)] px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" />
          Registrar llegada
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]"
            />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] py-8 text-[var(--color-text-secondary)]"
        >
          <p className="text-[14px]">No pudimos cargar la cola</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="min-h-[44px] px-4 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : esperando === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-10 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]"
          >
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-[16px] font-medium text-[var(--color-text-primary)]">
            No hay nadie esperando
          </p>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            Cuando llegue alguien, tocá “Registrar llegada” para anotarlo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.map((apt, idx) => (
            <ColaFila key={apt.appointment_id} apt={apt} posicion={idx + 1} />
          ))}
        </ul>
      )}

      {/* Montaje condicional: el modal se remonta fresco en cada apertura, así
          su estado (búsqueda/selección) arranca limpio sin un effect de reset. */}
      {modalAbierto && (
        <RegistrarLlegadaModal
          open
          onClose={() => setModalAbierto(false)}
          serviceId={serviceId}
          professionalId={professionalId}
          onRegistered={() => refetch()}
        />
      )}
    </section>
  )
}

// ─── Una fila de la cola ──────────────────────────────────────────────────────

function ColaFila({ apt, posicion }: { apt: Appointment; posicion: number }) {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const [atendido, setAtendido] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const nombre = apt.patients?.full_name ?? 'Paciente'
  const fichaHref = patientFichaHref(apt.patient_id, role)
  const esperaHace = apt.start_at
    ? formatDistanceToNowStrict(parseISO(apt.start_at), { locale: es })
    : null

  async function handleAtendido() {
    if (enviando) return
    setEnviando(true)
    setAtendido(true) // optimista
    try {
      const res = await fetch(`/api/appointments/${apt.appointment_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'No se pudo marcar como atendido')
      }
      // El realtime ya refresca; invalidamos igual para que salga al instante.
      queryClient.invalidateQueries({ queryKey: ['walk-in-queue'], exact: false })
      toast.success(`${nombre} marcado como atendido`)
    } catch (err) {
      setAtendido(false) // revertir
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar como atendido', {
        action: { label: 'Reintentar', onClick: () => void handleAtendido() },
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {/* Posición en la cola */}
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-interactive)]/12 text-[15px] font-bold text-[var(--color-interactive)]"
      >
        {posicion}
      </span>

      {/* Paciente + espera */}
      <div className="min-w-0 flex-1">
        {fichaHref ? (
          <Link
            href={fichaHref}
            className="block truncate text-[15px] font-semibold text-[var(--color-text-primary)] hover:underline"
          >
            {nombre}
          </Link>
        ) : (
          <p className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
            {nombre}
          </p>
        )}
        {esperaHace && (
          <p className="flex items-center gap-1 truncate text-[13px] text-[var(--color-text-secondary)]">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            Espera hace {esperaHace}
          </p>
        )}
      </div>

      {/* Acción: Atendido */}
      {atendido ? (
        <span className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--color-status-ok)]/15 px-3 text-[14px] font-semibold text-[var(--color-status-ok)]">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          Atendido
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void handleAtendido()}
          disabled={enviando}
          aria-label={`Marcar a ${nombre} como atendido`}
          className={[
            'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] px-4 text-[14px] font-semibold text-white transition-opacity',
            'bg-[var(--color-status-ok)] hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-status-ok)]/30',
            enviando ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          Atendido
        </button>
      )}
    </li>
  )
}

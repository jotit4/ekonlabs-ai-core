'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
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
//
// Pedido ISADI 2026-07-24 (Dr. Juan Diego) — la cola pasa a tener DOS BLOQUES:
//   • "Esperando": los pendientes, en orden LIFO (el ÚLTIMO que llegó arriba de
//     todo, el primero que llegó al final del bloque). El Dr lee de abajo hacia
//     arriba, así ve de una la última llegada sin scrollear.
//   • "Atendidos": los ya atendidos, atenuados, abajo. Antes desaparecían de la
//     lista; ahora quedan visibles con su hora de llegada.
// El número de cada fila NO es la posición visual: es el ORDEN DE LLEGADA REAL
// del día (1 = el primero que llegó) y no cambia cuando alguien pasa a atendido.
interface ColaOrdenLlegadaProps {
  serviceId: string
  professionalId: string
  /** Fecha de hoy en YYYY-MM-DD (para la queryKey de la cola). */
  hoyISO: string
}

export function ColaOrdenLlegada({ serviceId, professionalId, hoyISO }: ColaOrdenLlegadaProps) {
  const { queue, isLoading, isError, refetch, dataUpdatedAt } = useWalkInQueue(hoyISO, serviceId)
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)

  // Feedback optimista. Vive en el panel (no en la fila) porque al pasar de un
  // bloque al otro la fila se desmonta y el estado local se perdería.
  //
  // Se guarda el INSTANTE en que se tocó "Atendido", no un simple booleano: así
  // la marca caduca sola, sin effect de sincronización y sin competir con el
  // dato real. Una marca vale mientras el PATCH esté en vuelo o mientras el
  // último dato del servidor sea ANTERIOR a ella; en cuanto llega un dato
  // posterior manda el servidor (si dice 'completed' la fila igual queda abajo,
  // y si por lo que fuere volvió a 'confirmed' la fila sube de nuevo en vez de
  // quedar congelada).
  const [marcasAtendido, setMarcasAtendido] = useState<ReadonlyMap<string, number>>(
    () => new Map<string, number>(),
  )
  const [enviandoIds, setEnviandoIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  // Espejo síncrono de `enviandoIds` para cortar el doble click sin depender de
  // un re-render.
  const enviandoRef = useRef<Set<string>>(new Set<string>())

  // Orden de llegada real → número de fila. `queue` viene asc por start_at, así
  // que el índice + 1 es la posición de llegada. Es estable: no se recalcula por
  // bloque ni cambia cuando el de adelante pasa a "Atendidos".
  const posiciones = useMemo(() => {
    const mapa = new Map<string, number>()
    queue.forEach((apt, idx) => mapa.set(apt.appointment_id, idx + 1))
    return mapa
  }, [queue])

  const { esperando, atendidos } = useMemo(() => {
    const esp: Appointment[] = []
    const ate: Appointment[] = []
    for (const apt of queue) {
      const id = apt.appointment_id
      const marca = marcasAtendido.get(id) ?? 0
      const yaAtendido =
        apt.status === 'completed' || enviandoIds.has(id) || marca > dataUpdatedAt
      if (yaAtendido) ate.push(apt)
      else esp.push(apt)
    }
    // LIFO en los dos bloques: el más reciente arriba (el Dr lee de abajo hacia
    // arriba). `queue` está en orden de llegada asc, así que alcanza con invertir.
    esp.reverse()
    ate.reverse()
    return { esperando: esp, atendidos: ate }
  }, [queue, marcasAtendido, enviandoIds, dataUpdatedAt])

  // El contador del encabezado cuenta SOLO a los que todavía esperan.
  const cantidadEsperando = esperando.length

  // Función declarada (no useCallback) para poder referenciarse a sí misma en la
  // acción "Reintentar" del toast sin problemas de TDZ.
  async function marcarAtendido(apt: Appointment): Promise<void> {
    const id = apt.appointment_id
    if (enviandoRef.current.has(id)) return

    const nombre = apt.patients?.full_name ?? 'Paciente'
    enviandoRef.current.add(id)
    setEnviandoIds(new Set(enviandoRef.current))
    setMarcasAtendido((prev) => new Map(prev).set(id, Date.now()))

    try {
      const res = await fetch(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'No se pudo marcar como atendido')
      }
      // El realtime ya refresca; invalidamos igual para que baje al instante.
      queryClient.invalidateQueries({ queryKey: ['walk-in-queue'], exact: false })
      toast.success(`${nombre} marcado como atendido`)
    } catch (err) {
      // Revertir: vuelve al bloque "Esperando".
      setMarcasAtendido((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar como atendido', {
        action: { label: 'Reintentar', onClick: () => void marcarAtendido(apt) },
      })
    } finally {
      enviandoRef.current.delete(id)
      setEnviandoIds(new Set(enviandoRef.current))
    }
  }

  return (
    <section className="mt-10" aria-label="Cola de orden de llegada">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Cola de orden de llegada
          </h2>
          <span
            aria-label={`${cantidadEsperando} ${cantidadEsperando === 1 ? 'persona esperando' : 'personas esperando'}`}
            className="inline-flex min-h-[24px] items-center rounded-full bg-[var(--color-interactive)]/12 px-2.5 text-[13px] font-semibold text-[var(--color-interactive)]"
          >
            {cantidadEsperando} esperando
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
      ) : queue.length === 0 ? (
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
        <div className="flex flex-col gap-5">
          {/* ── Bloque 1: los que todavía esperan (último que llegó, arriba) ── */}
          <div>
            <BloqueTitulo texto="Esperando" cantidad={cantidadEsperando} />
            {cantidadEsperando === 0 ? (
              <p className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center text-[14px] text-[var(--color-text-secondary)]">
                No hay nadie esperando
              </p>
            ) : (
              <ul aria-label="Pacientes esperando" className="flex flex-col gap-2">
                {esperando.map((apt) => (
                  <ColaFila
                    key={apt.appointment_id}
                    apt={apt}
                    posicion={posiciones.get(apt.appointment_id) ?? 0}
                    atendido={false}
                    enviando={enviandoIds.has(apt.appointment_id)}
                    onAtendido={marcarAtendido}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* ── Bloque 2: los ya atendidos, atenuados ── */}
          {atendidos.length > 0 && (
            <div>
              <BloqueTitulo texto="Atendidos" cantidad={atendidos.length} />
              <ul aria-label="Pacientes atendidos" className="flex flex-col gap-2">
                {atendidos.map((apt) => (
                  <ColaFila
                    key={apt.appointment_id}
                    apt={apt}
                    posicion={posiciones.get(apt.appointment_id) ?? 0}
                    atendido
                    enviando={false}
                    onAtendido={marcarAtendido}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
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

// ─── Encabezado de bloque ─────────────────────────────────────────────────────

function BloqueTitulo({ texto, cantidad }: { texto: string; cantidad: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
      {texto}
      <span className="rounded-full bg-[var(--color-border)]/60 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
        {cantidad}
      </span>
    </h3>
  )
}

// ─── Una fila de la cola ──────────────────────────────────────────────────────

function ColaFila({
  apt,
  posicion,
  atendido,
  enviando,
  onAtendido,
}: {
  apt: Appointment
  /** Orden de llegada REAL (1 = el primero que llegó), no la posición visual. */
  posicion: number
  atendido: boolean
  enviando: boolean
  onAtendido: (apt: Appointment) => void | Promise<void>
}) {
  const role = useUserRole()

  const nombre = apt.patients?.full_name ?? 'Paciente'
  const fichaHref = patientFichaHref(apt.patient_id, role)
  // Hora de llegada en 24h (HH:mm) — desambigua el orden a simple vista.
  const horaLlegada = apt.start_at ? format(parseISO(apt.start_at), 'HH:mm') : null
  const esperaHace =
    !atendido && apt.start_at
      ? formatDistanceToNowStrict(parseISO(apt.start_at), { locale: es })
      : null

  return (
    <li
      className={[
        'flex items-center gap-3 rounded-[14px] border px-4 py-3',
        atendido
          ? 'border-[var(--color-border)] bg-[var(--color-surface)] opacity-70'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]',
      ].join(' ')}
    >
      {/* Número de LLEGADA (no posición visual: la lista se muestra al revés) */}
      <span
        aria-hidden="true"
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold tabular-nums',
          atendido
            ? 'bg-[var(--color-border)]/60 text-[var(--color-text-secondary)]'
            : 'bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]',
        ].join(' ')}
      >
        {posicion}
      </span>

      {/* Paciente + hora de llegada */}
      <div className="min-w-0 flex-1">
        <span className="sr-only">Llegada número {posicion}. </span>
        {fichaHref ? (
          <Link
            href={fichaHref}
            className={[
              'block truncate text-[15px] font-semibold hover:underline',
              atendido
                ? 'text-[var(--color-text-secondary)]'
                : 'text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {nombre}
          </Link>
        ) : (
          <p
            className={[
              'truncate text-[15px] font-semibold',
              atendido
                ? 'text-[var(--color-text-secondary)]'
                : 'text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {nombre}
          </p>
        )}
        {horaLlegada && (
          <p className="flex items-center gap-1 truncate text-[13px] text-[var(--color-text-secondary)]">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            {esperaHace ? `Llegó ${horaLlegada} · espera hace ${esperaHace}` : `Llegó ${horaLlegada}`}
          </p>
        )}
      </div>

      {/* Acción: Atendido (los atendidos muestran el sello, sin botón) */}
      {atendido ? (
        <span className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--color-status-ok)]/15 px-3 text-[14px] font-semibold text-[var(--color-status-ok)]">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          Atendido
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void onAtendido(apt)}
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

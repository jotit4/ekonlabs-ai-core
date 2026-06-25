'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isAfter } from 'date-fns'
import { toast } from 'sonner'
import {
  Clock,
  Check,
  CheckCircle2,
  MoreVertical,
  CalendarClock,
  UserX,
  ArrowRight,
  Ban,
} from 'lucide-react'
import { RescheduleTurnoModal } from '@/components/agenda/RescheduleTurnoModal'
import { AbsenceDecisionDialog } from '@/components/agenda/AbsenceDecisionDialog'
import { CancelConfirmInline } from '@/components/agenda/CancelConfirmInline'
import { useAppointmentActions } from '@/hooks/use-appointment-actions'
import { useUserRole } from '@/hooks/use-user-role'
import { patientFichaHref } from '@/lib/agenda/patient-ficha-href'
import type { Appointment } from '@/types/appointments'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'
import type { UserRole } from '@/types'

// Cuántos turnos próximos mostramos en la lista corta del Modo recepción.
const MAX_PROXIMOS = 4

interface ProximosTurnosProps {
  /** Turnos de hoy (el mismo set que ya trae useAppointments en la página). */
  appointments: Appointment[]
  /** Fecha de hoy en YYYY-MM-DD — para invalidar la queryKey correcta y para el modal. */
  hoyISO: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function ProximosTurnos({
  appointments,
  hoyISO,
  isLoading,
  isError,
  onRetry,
}: ProximosTurnosProps) {
  const queryClient = useQueryClient()
  const role = useUserRole()

  // Turno seleccionado para reprogramar (abre el mismo modal que la agenda).
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)

  // Total de turnos de hoy NO cancelados (para el link "Ver los N turnos de hoy").
  const totalHoy = useMemo(
    () => appointments.filter((t) => t.status !== 'cancelled').length,
    [appointments],
  )

  // Próximos turnos: hoy, NO cancelados, con start_at >= ahora, orden asc, top 4.
  // Recalculamos `ahora` en cada render del memo (depende de appointments); para
  // recepción es suficiente — la lista se refresca al marcar asistencia.
  const proximos = useMemo(() => {
    const ahora = new Date()
    return appointments
      .filter((t) => t.status !== 'cancelled')
      .filter((t) => t.start_at && isAfter(parseISO(t.start_at), ahora))
      .sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime())
      .slice(0, MAX_PROXIMOS)
  }, [appointments])

  // ── Estados de carga / error ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <section className="mt-10" aria-busy="true">
        <SectionHeader totalHoy={null} />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]"
            />
          ))}
        </div>
      </section>
    )
  }

  if (isError) {
    return (
      <section className="mt-10">
        <SectionHeader totalHoy={null} />
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] py-10 text-[var(--color-text-secondary)]"
        >
          <p className="text-[14px]">No pudimos cargar los próximos turnos</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] px-4 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
          >
            Reintentar
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-10" aria-label="Quién viene ahora">
      <SectionHeader totalHoy={totalHoy} />

      {proximos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-12 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]"
          >
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-[16px] font-medium text-[var(--color-text-primary)]">
            No hay más turnos por hoy <span aria-hidden="true">✨</span>
          </p>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            Cuando llegue alguien nuevo, va a aparecer acá.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {proximos.map((turno, idx) => (
            <TurnoFila
              key={turno.appointment_id}
              turno={turno}
              hoyISO={hoyISO}
              esProximo={idx === 0}
              queryClient={queryClient}
              onReschedule={() => setRescheduleTarget(turno)}
              role={role}
            />
          ))}
        </ul>
      )}

      {/* Reprogramar — reusado tal cual de la agenda. */}
      <RescheduleTurnoModal
        open={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        date={hoyISO}
      />
    </section>
  )
}

// ─── Encabezado de la sección ─────────────────────────────────────────────────

function SectionHeader({ totalHoy }: { totalHoy: number | null }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-text-primary)]">
        Quién viene ahora
      </h2>
      {totalHoy !== null && totalHoy > 0 && (
        <Link
          href="/agenda?vista=dia"
          className="flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-[var(--color-interactive)] hover:underline"
        >
          {`Ver los ${totalHoy} ${totalHoy === 1 ? 'turno' : 'turnos'} de hoy`}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

// ─── Una fila de turno ────────────────────────────────────────────────────────

interface TurnoFilaProps {
  turno: Appointment
  hoyISO: string
  esProximo: boolean
  queryClient: ReturnType<typeof useQueryClient>
  onReschedule: () => void
  role: UserRole | null
}

function TurnoFila({ turno, hoyISO, esProximo, queryClient, onReschedule, role }: TurnoFilaProps) {
  // Estado optimista local: una vez que marcamos "Llegó", la fila pasa a "Presente".
  // Si el server falla, lo revertimos. El refetch de la query confirma el estado real.
  const [presente, setPresente] = useState(turno.status === 'completed')
  const [enviando, setEnviando] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)

  // Hook compartido de acciones: maneja cancelar (con flujo de serie), no_show (con
  // flujo de serie) y el AbsenceDecisionDialog para paquetes.
  const actions = useAppointmentActions(hoyISO)

  const nombrePaciente = turno.patients?.full_name ?? 'Paciente'
  const nombreServicio = turno.services?.name ?? null
  const nombreProfesional =
    turno.professionals?.name ?? turno.services?.professional_name ?? null
  const horaTexto = turno.start_at ? format(parseISO(turno.start_at), 'HH:mm') : '--:--'
  const fichaHref = patientFichaHref(turno.patient_id, role)

  // Invalida la query del día — misma queryKey que usa useAppointments(hoyISO):
  // ['agenda', 'day', hoyISO, ...]. Como invalidamos por prefijo, refresca tanto
  // la lista de acá como el resumen (Turnos / Confirmados) de la página.
  function invalidarDia() {
    queryClient.invalidateQueries({ queryKey: ['agenda', 'day', hoyISO] })
  }

  async function actualizarEstado(status: 'completed') {
    const response = await fetch(`/api/appointments/${turno.appointment_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'No se pudo actualizar el turno')
    }
  }

  async function handleLlego() {
    if (enviando) return
    setEnviando(true)
    setPresente(true) // optimista
    try {
      await actualizarEstado('completed')
      invalidarDia()
      // Bug fix (Story D / Story F): "Deshacer" se quitó porque el endpoint no acepta
      // status:'confirmed' — el schema solo permite cancelled|completed|no_show.
      // Un turno marcado como 'completed' no puede revertirse sin cambiar el backend.
      toast.success(`${nombrePaciente} marcado como presente`)
    } catch (err) {
      setPresente(false) // revertir
      toast.error(
        err instanceof Error ? err.message : 'No se pudo marcar la asistencia',
        { action: { label: 'Reintentar', onClick: handleLlego } },
      )
    } finally {
      setEnviando(false)
    }
  }

  // "No vino" — migrado a useAppointmentActions (Story D).
  // Si el turno pertenece a una serie (package_id), el hook abre AbsenceDecisionDialog.
  // Si no, actualiza el status directamente y refresca la query.
  async function handleNoVino() {
    setMenuAbierto(false)
    await actions.handleAttendanceSelect(turno, 'no_show')
  }

  // "Cancelar turno" — usa useAppointmentActions.
  // El hook abre CancelConfirmInline (si es turno suelto) o AbsenceDecisionDialog
  // (si es turno de serie) al confirmar.
  function handleCancelarClick() {
    setMenuAbierto(false)
    actions.clearCancelError()
    actions.setCancelTarget(turno)
  }

  async function handleCancelConfirm() {
    await actions.handleCancelConfirm()
    // Si era turno suelto: cancelTarget queda null → CancelConfirmInline desaparece.
    // Si era turno de serie: absenceTarget se activa → AbsenceDecisionDialog aparece.
  }

  async function handleAbsenceConfirm(decision: AbsenceDecision, note?: string) {
    await actions.handleAbsenceConfirm(decision, note)
  }

  // ¿Está mostrando la confirmación de cancelar para ESTE turno?
  const mostrandoCancelConfirm =
    actions.cancelTarget?.appointment_id === turno.appointment_id

  const disabled = enviando || actions.cancelLoading || actions.attendanceLoading

  return (
    <li
      className={[
        'rounded-[14px] border px-4 py-3 transition-colors',
        mostrandoCancelConfirm
          ? 'flex flex-col gap-3 border-[var(--color-border)] bg-[var(--color-surface)]'
          : [
              'flex items-center gap-3',
              presente
                ? 'border-[var(--color-status-ok)]/40 bg-[var(--color-status-ok)]/8'
                : esProximo
                  ? 'border-[var(--color-interactive)]/40 bg-[var(--color-surface)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]',
            ].join(' '),
      ].join(' ')}
    >
      {mostrandoCancelConfirm ? (
        // ── Confirmación inline de cancelación ──
        <>
          <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {nombrePaciente} · {horaTexto}
          </p>
          <CancelConfirmInline
            patientName={nombrePaciente}
            onConfirm={() => void handleCancelConfirm()}
            onClose={() => {
              actions.setCancelTarget(null)
              actions.clearCancelError()
            }}
            isLoading={actions.cancelLoading}
            error={actions.cancelError}
          />
        </>
      ) : (
        <>
          {/* Indicador del próximo + hora */}
          <div className="flex min-w-[68px] shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={[
                'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                esProximo && !presente
                  ? 'bg-[var(--color-interactive)]'
                  : 'bg-transparent',
              ].join(' ')}
            />
            <span className="flex items-center gap-1 text-[16px] font-bold leading-none text-[var(--color-text-primary)]">
              <Clock aria-hidden="true" className="h-4 w-4 text-[var(--color-text-secondary)]" />
              {horaTexto}
            </span>
          </div>

          {/* Paciente + servicio · profesional */}
          <div className={['min-w-0 flex-1', presente ? 'opacity-60' : ''].join(' ')}>
            {fichaHref ? (
              <Link
                href={fichaHref}
                className="block truncate text-[15px] font-semibold text-[var(--color-text-primary)] hover:underline"
              >
                {nombrePaciente}
              </Link>
            ) : (
              <p className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
                {nombrePaciente}
              </p>
            )}
            {(nombreServicio ?? nombreProfesional) && (
              <p className="truncate text-[13px] text-[var(--color-text-secondary)]">
                {[nombreServicio, nombreProfesional].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Acción primaria */}
          {presente ? (
            <span className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--color-status-ok)]/15 px-3 text-[14px] font-semibold text-[var(--color-status-ok)]">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              Presente
            </span>
          ) : (
            <button
              type="button"
              onClick={handleLlego}
              disabled={disabled}
              className={[
                'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] px-4 text-[14px] font-semibold',
                'bg-[var(--color-status-ok)] text-white transition-opacity',
                'hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-status-ok)]/30',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
              aria-label={`Marcar que ${nombrePaciente} llegó`}
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              Llegó
            </button>
          )}

          {/* Acción secundaria: kebab con No vino / Reprogramar / Cancelar */}
          {!presente && (
            <KebabMenu
              nombrePaciente={nombrePaciente}
              abierto={menuAbierto}
              onToggle={() => setMenuAbierto((v) => !v)}
              onClose={() => setMenuAbierto(false)}
              onNoVino={() => void handleNoVino()}
              onReprogramar={() => {
                setMenuAbierto(false)
                onReschedule()
              }}
              onCancelar={handleCancelarClick}
              disabled={disabled}
            />
          )}
        </>
      )}

      {/* AbsenceDecisionDialog — usa position:fixed, no afecta el layout del <li> */}
      {actions.absenceTarget?.appointment.appointment_id === turno.appointment_id && (
        <AbsenceDecisionDialog
          appointment={actions.absenceTarget.appointment}
          action={actions.absenceTarget.action}
          onConfirm={(decision, note) => void handleAbsenceConfirm(decision, note)}
          onClose={actions.clearAbsenceTarget}
          isLoading={actions.absenceLoading}
          error={actions.absenceError}
        />
      )}
    </li>
  )
}

// ─── Menú "⋯" de acciones secundarias ─────────────────────────────────────────

interface KebabMenuProps {
  nombrePaciente: string
  abierto: boolean
  onToggle: () => void
  onClose: () => void
  onNoVino: () => void
  onReprogramar: () => void
  /** Nueva acción: cancelar el turno. */
  onCancelar: () => void
  disabled: boolean
}

function KebabMenu({
  nombrePaciente,
  abierto,
  onToggle,
  onClose,
  onNoVino,
  onReprogramar,
  onCancelar,
  disabled,
}: KebabMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [abierto, onClose])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30"
        aria-label={`Más acciones para ${nombrePaciente}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        <MoreVertical aria-hidden="true" className="h-5 w-5" />
      </button>
      {abierto && (
        <div
          role="menu"
          aria-label={`Acciones para ${nombrePaciente}`}
          className="absolute right-0 top-12 z-20 min-w-[200px] overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onNoVino}
            disabled={disabled}
            className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-[14px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            <UserX aria-hidden="true" className="h-4 w-4 text-[var(--color-status-alert,#ff3b30)]" />
            No vino
          </button>
          <div className="border-t border-[var(--color-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={onReprogramar}
            className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-[14px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
          >
            <CalendarClock aria-hidden="true" className="h-4 w-4 text-[var(--color-text-secondary)]" />
            Reprogramar
          </button>
          <div className="border-t border-[var(--color-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={onCancelar}
            disabled={disabled}
            className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-[14px] text-[#ef4444] hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            <Ban aria-hidden="true" className="h-4 w-4" />
            Cancelar turno
          </button>
        </div>
      )}
    </div>
  )
}

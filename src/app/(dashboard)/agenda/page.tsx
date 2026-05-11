'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatISO, parseISO, addDays, isToday, format, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarView } from '@/components/agenda/CalendarView'
import { KPIStrip } from '@/components/agenda/KPIStrip'
import { NewTurnoModal } from '@/components/agenda/NewTurnoModal'
import { RescheduleTurnoModal } from '@/components/agenda/RescheduleTurnoModal'
import { useAgendaRealtime } from '@/hooks/use-agenda-realtime'
import { useAppointments } from '@/hooks/use-appointments'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'
import type { Appointment } from '@/types/appointments'

function parseValidDate(str: string | null): Date {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date()
  const parsed = parseISO(str)
  return isValid(parsed) ? parsed : new Date()
}

export default function AgendaPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const selectedDate = parseValidDate(searchParams.get('fecha'))
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  useAgendaRealtime(isoDate)

  const { appointments, isLoading, isError, refetch } = useAppointments(isoDate)
  const { status: gcalStatus } = useGCalChannelStatus()

  const prevISO = formatISO(addDays(selectedDate, -1), { representation: 'date' })
  const nextISO = formatISO(addDays(selectedDate, 1), { representation: 'date' })
  const hoy = isToday(selectedDate)

  const [showNewTurnoModal, setShowNewTurnoModal] = useState(false)
  const [showRescheduleTurnoModal, setShowRescheduleTurnoModal] = useState(false)
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] =
    useState<Appointment | null>(null)

  function handleOpenReschedule(appointment: Appointment) {
    setSelectedAppointmentForReschedule(appointment)
    setShowRescheduleTurnoModal(true)
  }

  function handleCloseReschedule() {
    setShowRescheduleTurnoModal(false)
    setSelectedAppointmentForReschedule(null)
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight capitalize">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowNewTurnoModal(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-white bg-[var(--color-interactive)] hover:opacity-90 transition-opacity"
            aria-label="Nuevo turno"
          >
            + Nuevo turno
          </button>
          <nav
            className="flex items-center gap-1"
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
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-interactive)]"
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
        </div>
      </header>
      <KPIStrip appointments={appointments} isLoading={isLoading} isError={isError} />
      <CalendarView
        date={isoDate}
        appointments={appointments}
        isLoading={isLoading}
        isError={isError}
        onRefetch={refetch}
        onReschedule={handleOpenReschedule}
        gcalStatus={gcalStatus}
      />
      <NewTurnoModal
        open={showNewTurnoModal}
        onClose={() => setShowNewTurnoModal(false)}
        date={isoDate}
      />
      <RescheduleTurnoModal
        open={showRescheduleTurnoModal}
        onClose={handleCloseReschedule}
        appointment={selectedAppointmentForReschedule}
        date={isoDate}
      />
    </section>
  )
}

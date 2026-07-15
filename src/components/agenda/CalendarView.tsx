'use client'

import { useMemo } from 'react'
import type { Appointment } from '@/types/appointments'
import {
  buildCellMap,
  computeHourRows,
  floorToStep,
  hhmmFromDate,
  makeGetCell,
  type ApptEntry,
  type TurneroColumn,
} from '@/lib/agenda/turnero-grid'
import { TurneroGrid } from './TurneroGrid'
import { AgendaDayViewSkeleton } from './AgendaDayView'

const NO_PROFESSIONAL_ID = 'sin-profesional'
const NO_PROFESSIONAL_LABEL = 'Sin profesional'
// Paso de la grilla: 60 min. Los servicios de ISADI duran 60 (los de 30 min
// se apilan dentro de la celda de su hora sin perder densidad).
const STEP_MIN = 60

interface CalendarViewProps {
  date: string
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  // Aceptado por compatibilidad — la reprogramación vive ahora en TurnoDetailModal.
  onReschedule?: (appointment: Appointment) => void
  onAppointmentClick?: (appointment: Appointment) => void
  /**
   * Click en una celda vacía de la grilla → atajo "Dar un turno" con fecha
   * (=date), hora y — cuando la columna clickeada ya identifica a un
   * profesional real (no la columna sintética "Sin profesional") — su
   * professional_id. Reemplaza el click en hueco libre retirado (pedido ISADI
   * 2026-07-14 de no mostrar huecos en el calendario).
   */
  onEmptyCellClick?: (date: string, timeHHmm: string, professionalId?: string) => void
}

function professionalColIdOf(apt: Appointment): { id: string; label: string } {
  const label =
    apt.professionals?.name ?? apt.services?.professional_name ?? NO_PROFESSIONAL_LABEL
  const id = apt.professional_id ?? (label === NO_PROFESSIONAL_LABEL ? NO_PROFESSIONAL_ID : `name:${label}`)
  return { id, label }
}

// Un colId identifica a un profesional REAL solo cuando viene de
// `apt.professional_id` (un UUID). Las columnas sintéticas ("Sin profesional"
// o agrupadas solo por nombre) no tienen un id agendable.
function isRealProfessionalId(colId: string): boolean {
  return colId !== NO_PROFESSIONAL_ID && !colId.startsWith('name:')
}

export function CalendarView({
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onEmptyCellClick,
  onAppointmentClick,
}: CalendarViewProps) {
  // Los CANCELADOS no se muestran en la agenda (decisión 2026-07-14): desaparecen
  // de la grilla y liberan el hueco, igual que borrar la celda en el Excel. El
  // estado se sigue guardando y viendo en el historial/detalle del paciente — es
  // solo un filtro de esta VISTA. Los no_show SÍ se siguen mostrando (el turno
  // existió y ocupó el horario). Filtrado acá (no en el hook compartido
  // useAppointments) porque ese hook también alimenta KPIStrip, SyncStatusBanner,
  // /recepcion y /inicio, que SÍ necesitan ver los cancelados (conteo, ProximosTurnos).
  const validAppointments = useMemo(
    () => appointments.filter((apt) => apt && apt.start_at && apt.end_at && apt.status !== 'cancelled'),
    [appointments],
  )

  const grid = useMemo(() => {
    // Columnas = profesionales presentes en los turnos del día.
    const columnMap = new Map<string, { label: string; count: number }>()

    const apptEntries: ApptEntry[] = []
    for (const apt of validAppointments) {
      const { id, label } = professionalColIdOf(apt)
      const entry = columnMap.get(id)
      if (entry) entry.count += 1
      else columnMap.set(id, { label, count: 1 })
      apptEntries.push({
        colId: id,
        hour: floorToStep(hhmmFromDate(new Date(apt.start_at)), STEP_MIN),
        apt,
      })
    }

    const columns: TurneroColumn[] = Array.from(columnMap.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
      .map(([id, { label, count }]) => ({
        id,
        label,
        sublabel: count > 0 ? `${count} ${count === 1 ? 'turno' : 'turnos'}` : 'Sin turnos',
      }))

    const times = apptEntries.map((e) => e.hour)
    const hourRows = computeHourRows(times, { stepMin: STEP_MIN })

    // Ya no hay huecos libres que ubicar en la grilla (pedido ISADI 2026-07-14):
    // el tercer argumento siempre es [].
    const cellMap = buildCellMap(hourRows, apptEntries, [])
    const getCell = makeGetCell(cellMap)

    return { columns, hourRows, getCell }
  }, [validAppointments])

  if (isLoading) {
    return <AgendaDayViewSkeleton />
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
      >
        <p className="text-sm">Error al cargar los turnos</p>
        <button
          onClick={() => onRefetch()}
          className="min-h-[44px] px-4 text-sm text-[var(--color-interactive)] hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (grid.columns.length === 0) {
    return (
      <div
        style={{
          padding: '64px 0',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 14,
        }}
      >
        Sin turnos para este día
      </div>
    )
  }

  // "Ahora": las horas ya pasadas de hoy se atenúan y no ofrecen el atajo de
  // agendar; una línea marca la hora actual. Solo aplica si la fecha mostrada
  // es hoy.
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const nowHHMM = hhmmFromDate(now)
  const isCurrentDay = date === todayIso
  const isPastCell = isCurrentDay
    ? (_colId: string, hour: string) => hour < nowHHMM
    : undefined
  const nowAtHour = isCurrentDay ? grid.hourRows.find((h) => h >= nowHHMM) : undefined
  const nowLine = nowAtHour ? { atHour: nowAtHour, appliesToColumn: () => true } : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TurneroGrid
        columns={grid.columns}
        hourRows={grid.hourRows}
        getCell={grid.getCell}
        onAppointmentClick={onAppointmentClick}
        onEmptyCellClick={
          onEmptyCellClick
            ? (colId, hour) =>
                onEmptyCellClick(date, hour, isRealProfessionalId(colId) ? colId : undefined)
            : undefined
        }
        isPastCell={isPastCell}
        nowLine={nowLine}
        ariaLabel="Grilla de turnos por profesional"
      />
    </div>
  )
}

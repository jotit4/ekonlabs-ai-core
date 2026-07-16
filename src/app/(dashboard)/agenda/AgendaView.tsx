'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import {
  formatISO, parseISO, addDays, addMonths,
  isToday, format, isValid,
  startOfMonth, endOfMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarView } from '@/components/agenda/CalendarView'
import { CalendarViewRangeReadOnly } from '@/components/agenda/CalendarViewRangeReadOnly'
import { CalendarViewSelector, type CalendarViewType } from '@/components/agenda/CalendarViewSelector'
import { TurnoDetailModal } from '@/components/agenda/TurnoDetailModal'
import { KPIStrip } from '@/components/agenda/KPIStrip'
import { NewTurnoModal } from '@/components/agenda/NewTurnoModal'
import { NewPaqueteModal } from '@/components/paquetes/NewPaqueteModal'
import { RescheduleTurnoModal } from '@/components/agenda/RescheduleTurnoModal'
import { DayStatusModal } from '@/components/agenda/DayStatusModal'
import { AgendaFilters, AgendaServiceButtons, type AreaFocus } from '@/components/agenda/AgendaFilters'
import { isRehabService } from '@/lib/agenda/service-visuals'
import { SyncStatusBanner } from '@/components/agenda/SyncStatusBanner'
import { GCalDegradationBanner } from '@/components/agenda/GCalDegradationBanner'
import { useAgendaRealtime } from '@/hooks/use-agenda-realtime'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { useUserRole } from '@/hooks/use-user-role'
import { useDayStatusRange } from '@/hooks/use-day-status'
import { useSetDayStatus } from '@/hooks/use-set-day-status'
import type { Appointment } from '@/types/appointments'
import type { UserRole } from '@/types'

function parseValidDate(str: string | null): Date {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date()
  const parsed = parseISO(str)
  return isValid(parsed) ? parsed : new Date()
}

interface AgendaViewProps {
  /**
   * Rol resuelto server-side (page.tsx, desde el JWT de la sesión). Fija el rol
   * del PRIMER frame para evitar el parpadeo de la cabecera: sin esto, useUserRole
   * arranca en null y se pinta la agenda completa un instante antes de colapsar al
   * modo turnero de recepción. useUserRole sigue usándose como sincronización en
   * cliente y, una vez resuelto, prevalece.
   */
  initialRole?: UserRole | null
}

export function AgendaView({ initialRole = null }: AgendaViewProps = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  // El rol del cliente (async) tiene prioridad una vez resuelto; hasta entonces
  // usamos el rol del server para que el primer render ya sea el correcto.
  const clientRole = useUserRole()
  const role = clientRole ?? initialRole

  const selectedDate = parseValidDate(searchParams.get('fecha'))
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  const professionalId = searchParams.get('professional_id') ?? null
  const serviceId = searchParams.get('service_id') ?? null

  // ── Modo turnero (recepción) vs agenda completa (admin) ─────────────────────
  // La recepcionista se abruma con demasiados controles: su flujo es "abrir y ver
  // todo" (como su turnero de Excel). Para el rol 'receptionist' arrancamos en un
  // modo mínimo — solo título + navegación + "Dar turno" + un botón "Filtrar" que
  // despliega el resto. El admin conserva la agenda completa (todo visible).
  const isReceptionist = role === 'receptionist'

  // Panel "Filtrar" (solo recepción). Estado local, cerrado por defecto. Al
  // abrirlo se revelan los controles secundarios (selector de vista, dropdowns +
  // Limpiar, "Nuevo paquete"). Para admin no aplica: todo está siempre visible.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const secondaryVisible = isReceptionist ? filtersOpen : true

  // Foco de área (rediseño foco rehabilitación). Estado local (no URL) — es una
  // preferencia de vista, no un filtro persistible/compartible. Cuando el usuario
  // elige un servicio puntual (serviceId), ese filtro manda y el foco de área no
  // recorta nada adicional.
  //
  // Default = 'rehab' para TODOS los roles (admin, doctor y — decisión cliente
  // ISADI 2026-07-14 — también recepción): rehabilitación es el trabajo diario,
  // el resto de los servicios mete ruido. NO es un candado — un toque en "Ver
  // todo" (radiogroup de AgendaFilters) lo saca del recorte para todo el resto
  // de la sesión; el permiso real de recepción para ver/agendar cualquier
  // servicio no cambia, esto es solo el default de UI.
  //
  // Depende de `isRehabService` (heurística PROVISIONAL por nombre — no existe
  // `services.category` todavía; ver detalle en service-visuals.ts). Cuando
  // exista el campo real, este default sigue funcionando igual — solo cambia
  // qué servicios cuentan como "rehab".
  const [areaFocus, setAreaFocus] = useState<AreaFocus>('rehab')

  // Pedido 2 (ISADI 2026-07-16) — grupo de recepción seleccionado
  // (Fisioterapia/Pileta/Pilates, ver AgendaServiceButtons). Estado local (no
  // URL), mismo criterio que `areaFocus`: es una preferencia de vista de
  // recepción, no un service_id real (los grupos no existen en la tabla
  // `services`, no se pueden pasar a los hooks server-side como
  // `service_id=eq.<grupo>`) — se filtra CLIENTE, ver focusedAppointments/
  // focusedRangeAppointments más abajo. Solo tiene efecto para receptionist.
  const [receptionGroup, setReceptionGroup] = useState<string | null>(null)

  // Determinar vista activa desde query param.
  // AC6 (Story 10.7): vista default = Semana. Sin ?vista → 'semana'.
  // ?vista=dia y ?vista=mes son explícitos.
  const vistaParam = searchParams.get('vista')
  const vistaActiva: CalendarViewType =
    vistaParam === 'dia' ? 'dia'
    : vistaParam === 'mes' ? 'mes'
    : 'semana'

  // Calcular rangos para vista semana y mes.
  // Vista Semana: ventana de 7 días DESDE la fecha ancla (por defecto hoy). El
  // día ancla queda como PRIMERA columna; nunca se muestran días previos al
  // ancla (decisión del usuario — turnero hacia adelante).
  const weekStart = isoDate
  const weekEnd = formatISO(addDays(selectedDate, 6), { representation: 'date' })
  const monthStart = formatISO(startOfMonth(selectedDate), { representation: 'date' })
  const monthEnd = formatISO(endOfMonth(selectedDate), { representation: 'date' })

  const rangeFrom = vistaActiva === 'mes' ? monthStart : weekStart
  const rangeTo = vistaActiva === 'mes' ? monthEnd : weekEnd

  useAgendaRealtime(isoDate)

  // Hooks siempre llamados — nunca condicionales
  const { appointments, isLoading, isError, refetch } = useAppointments(isoDate, {
    professionalId,
    serviceId,
  })

  const {
    appointments: rangeAppointments,
    isLoading: rangeLoading,
    isError: rangeError,
    refetch: rangeRefetch,
  } = useAppointmentsRange(rangeFrom, rangeTo, { professionalId, serviceId })

  // Feriados + estado del día (pedido ISADI 2026-07-14) — mismo rango visible
  // que ya se usa para los turnos de Semana/Mes (rangeFrom/rangeTo). Se pasa
  // como PROP a CalendarViewRangeReadOnly (componente presentacional, no
  // fetchea nada) — el fetch/mutation viven acá, junto con el resto del
  // estado de modales de la agenda.
  const { days: dayStatusMap } = useDayStatusRange(rangeFrom, rangeTo)
  const setDayStatus = useSetDayStatus()
  const [decidingDate, setDecidingDate] = useState<string | null>(null)

  function handleDayStatusClick(date: string) {
    setDecidingDate(date)
  }

  function handleCloseDayStatus() {
    setDecidingDate(null)
  }

  function handleDecideDayStatus(isOpen: boolean, reason?: string) {
    if (!decidingDate) return
    setDayStatus.mutate(
      { date: decidingDate, is_open: isOpen, reason },
      { onSuccess: () => setDecidingDate(null) },
    )
  }

  // ── Foco de área: recorte a rehabilitación ─────────────────────────────────
  // Cuando areaFocus='rehab' y NO hay un servicio puntual elegido, recortamos los
  // turnos a los servicios de rehabilitación (heurística por nombre, centralizada
  // en service-visuals). Si el usuario eligió un service_id puntual, ese filtro
  // ya es más específico y el foco no recorta nada extra.
  // `receptionGroup` puntual (Pedido 2) manda igual que un `serviceId`
  // puntual: ambos son más específicos que el recorte por nombre y lo apagan.
  const applyRehabFocus = areaFocus === 'rehab' && !serviceId && !receptionGroup
  const isRehabAppointment = (apt: Appointment): boolean => isRehabService(apt.services?.name)

  // Pedido 2 (ISADI 2026-07-16) — filtro CLIENTE por grupo de recepción
  // (Fisioterapia/Pileta/Pilates). Solo activo cuando hay un grupo elegido;
  // se aplica DESPUÉS del recorte por foco de área (ver applyRehabFocus).
  const applyReceptionGroupFilter = isReceptionist && !!receptionGroup
  const isInReceptionGroup = (apt: Appointment): boolean =>
    apt.services?.reception_group === receptionGroup

  const focusedAppointments = (
    applyRehabFocus ? appointments.filter(isRehabAppointment) : appointments
  ).filter((apt) => !applyReceptionGroupFilter || isInReceptionGroup(apt))
  const focusedRangeAppointments = (
    applyRehabFocus ? rangeAppointments.filter(isRehabAppointment) : rangeAppointments
  ).filter((apt) => !applyReceptionGroupFilter || isInReceptionGroup(apt))

  const { usesNativeCalendar, isPending: tenantConfigPending } = useTenantConfig()
  const { status: gcalStatus } = useGCalChannelStatus(!tenantConfigPending && !usesNativeCalendar)

  // Navegación URL
  function buildFechaUrl(fecha: string): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fecha', fecha)
    return `/agenda?${params.toString()}`
  }

  // Calcular fechas de navegación según vista
  let prevISO: string
  let nextISO: string

  if (vistaActiva === 'semana') {
    // Semana = ventana de 7 días desde el ancla → navegar de a ±7 días (no de a
    // semana calendario). "Hoy" (abajo) resetea el ancla a hoy.
    prevISO = formatISO(addDays(selectedDate, -7), { representation: 'date' })
    nextISO = formatISO(addDays(selectedDate, 7), { representation: 'date' })
  } else if (vistaActiva === 'mes') {
    prevISO = formatISO(addMonths(selectedDate, -1), { representation: 'date' })
    nextISO = formatISO(addMonths(selectedDate, 1), { representation: 'date' })
  } else {
    prevISO = formatISO(addDays(selectedDate, -1), { representation: 'date' })
    nextISO = formatISO(addDays(selectedDate, 1), { representation: 'date' })
  }

  const hoy = isToday(selectedDate)

  // Título del header según vista — capitaliza solo la primera letra
  function getHeaderTitle(): string {
    let title: string
    if (vistaActiva === 'dia') {
      title = format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
    } else if (vistaActiva === 'semana') {
      // Rango [ancla .. ancla+6] (ej. "1 de jul – 7 de jul 2026").
      const wStart = selectedDate
      const wEnd = addDays(selectedDate, 6)
      title = `${format(wStart, "d 'de' MMM", { locale: es })} – ${format(wEnd, "d 'de' MMM yyyy", { locale: es })}`
    } else {
      title = format(selectedDate, 'MMMM yyyy', { locale: es })
    }
    return title.charAt(0).toUpperCase() + title.slice(1)
  }

  // Handler para cambiar vista.
  // AC6: 'semana' es el estado limpio (sin ?vista). 'dia'/'mes' se setean explícitos.
  function handleVistaChange(vista: CalendarViewType) {
    const params = new URLSearchParams(searchParams.toString())
    if (vista === 'semana') {
      params.delete('vista')
    } else {
      params.set('vista', vista)
    }
    router.push(`/agenda?${params.toString()}`)
  }

  const [showNewTurnoModal, setShowNewTurnoModal] = useState(false)
  // CTA secundario "Nuevo paquete" (Story 13.5) — abre el modal SIN initialPatient.
  const [showNewPaqueteModal, setShowNewPaqueteModal] = useState(false)
  // Prefill del NewTurnoModal al agendar desde una celda vacía de la grilla
  // (reemplaza el prefill que antes armaba el click en un hueco libre — pedido
  // ISADI 2026-07-14 de no mostrar huecos). Ya no se conoce el servicio del
  // hueco (no se consulta más disponibilidad para pintar el calendario): solo
  // se prellenan fecha + hora, y el profesional cuando la vista Día ya lo
  // identifica desde la columna clickeada.
  const [newTurnoPrefill, setNewTurnoPrefill] = useState<{
    date: string
    timeHHmm: string
    serviceId?: string
    professionalId?: string
  } | null>(null)
  const [showRescheduleTurnoModal, setShowRescheduleTurnoModal] = useState(false)
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] =
    useState<Appointment | null>(null)
  const [selectedAppointmentDetail, setSelectedAppointmentDetail] =
    useState<Appointment | null>(null)

  function handleOpenReschedule(appointment: Appointment) {
    setSelectedAppointmentForReschedule(appointment)
    setShowRescheduleTurnoModal(true)
  }

  function handleCloseReschedule() {
    setShowRescheduleTurnoModal(false)
    setSelectedAppointmentForReschedule(null)
  }

  function handleAppointmentClick(appointment: Appointment) {
    setSelectedAppointmentDetail(appointment)
  }

  function handleRescheduleFromDetail(appointment: Appointment) {
    setSelectedAppointmentDetail(null)
    handleOpenReschedule(appointment)
  }

  // Exclusión mutua (professional_id ⊕ service_id): nunca se mandan los dos a la
  // vez. Antes vivía en el radiogroup "Ver disponibilidad de" (eliminado); ahora
  // se dispara desde el onChange de cada dropdown. Se resuelve en un ÚNICO push
  // (set uno + delete el opuesto) — llamar a los dos handlers por separado
  // provocaría dos navegaciones que se pisan (cada una lee el searchParams viejo).
  function handleProfessionalChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('professional_id', id)
      params.delete('service_id')
    } else {
      params.delete('professional_id')
    }
    router.push(`/agenda?${params.toString()}`)
  }

  function handleServiceChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('service_id', id)
      params.delete('professional_id')
    } else {
      params.delete('service_id')
    }
    router.push(`/agenda?${params.toString()}`)
  }

  function handleClearFilters() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('professional_id')
    params.delete('service_id')
    router.push(`/agenda?${params.toString()}`)
    // Deuda B4 (filtros de recepción intersectados) — "Limpiar" es la acción
    // de reset TOTAL: si no resetea también el grupo de recepción, el botón
    // de grupo queda visualmente activo y el filtro cliente
    // (applyReceptionGroupFilter, ver más arriba) sigue recortando la agenda
    // después del click, contradiciendo la intención de "limpiar todo". No-op
    // para admin/doctor (receptionGroup siempre null fuera de recepción).
    setReceptionGroup(null)
  }

  // Deuda B4 (filtros de recepción intersectados) — cambiar (o limpiar) el
  // grupo de recepción es una selección MÁS GRUESA que service_id/
  // professional_id. Si alguno de los dos quedó seteado en la URL por una
  // selección previa (p.ej. el dropdown de Profesional en AgendaFilters, tras
  // abrir "Filtrar"), intersecta con el grupo nuevo y puede dejar la agenda
  // vacía con un filtro visual engañoso: el grupo dice una cosa (p.ej.
  // "Fisioterapia") y el service_id/profesional residual restringe a otra
  // (p.ej. un profesional que no hace fisioterapia). Centralizamos la
  // transición ACÁ — único lugar que decide qué pasa con service_id/
  // professional_id cuando cambia el grupo — para que ningún otro punto del
  // componente tenga que duplicar esta limpieza.
  function handleReceptionGroupChange(group: string | null) {
    setReceptionGroup(group)
    const params = new URLSearchParams(searchParams.toString())
    if (params.has('service_id') || params.has('professional_id')) {
      params.delete('service_id')
      params.delete('professional_id')
      router.push(`/agenda?${params.toString()}`)
    }
  }

  // Cambiar el foco de área (Rehabilitación ↔ Ver todo). Si había un service_id
  // puntual elegido que ya no pertenece al nuevo foco, lo limpiamos para no
  // mostrar una agenda vacía con un filtro fuera de foco.
  function handleAreaFocusChange(focus: AreaFocus) {
    setAreaFocus(focus)
  }

  // Atajo "Dar un turno" al hacer click en una celda vacía de la grilla (Día o
  // Semana) — reemplaza el que antes disparaba el chip de hueco libre, retirado
  // por pedido ISADI 2026-07-14 (no mostrar huecos en el calendario). Ya no se
  // consulta disponibilidad para pintar la grilla, así que no se conoce el
  // servicio del hueco: solo se prellenan fecha + hora (+ profesional cuando la
  // vista Día ya lo identifica desde la columna clickeada).
  function handleEmptyCellClick(date: string, timeHHmm: string, professionalId?: string) {
    setNewTurnoPrefill({ date, timeHHmm, professionalId })
    setShowNewTurnoModal(true)
  }

  function handleCloseNewTurno() {
    setShowNewTurnoModal(false)
    setNewTurnoPrefill(null)
  }

  // La recepcionista es la usuaria principal del módulo → tiene acceso a los
  // filtros (aunque en modo turnero arrancan plegados tras "Filtrar").
  const showFilters = role === 'admin' || role === 'receptionist'

  // Botón primario: en recepción se llama "Dar turno" (lenguaje del turnero);
  // para admin se conserva "Nuevo turno".
  const turnoLabel = isReceptionist ? 'Dar turno' : 'Nuevo turno'

  return (
    <section className="w-full h-full flex flex-col px-4 lg:px-6 py-4">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">
            {getHeaderTitle()}
          </h1>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap justify-end">
          {/* Selector de vista: SIEMPRE visible (Pedido 3 ISADI 2026-07-16).
              Antes vivía detrás de "Filtrar" en modo turnero (recepción), lo
              que lo dejaba escondido tras un toque extra — mismo criterio que
              AgendaServiceButtons (pedido 2026-07-14): un control de
              navegación básico no se esconde detrás de un toggle
              secundario. */}
          <CalendarViewSelector activeView={vistaActiva} onChange={handleVistaChange} />
          {/* Botón "Filtrar" — solo recepción. Despliega el selector de vista, los
              dropdowns Profesional/Servicio (+ Limpiar) y "Nuevo paquete". */}
          {isReceptionist && (
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="agenda-secondary-controls"
              aria-label="Filtrar"
              data-tour="agenda-filtrar-btn"
              className={[
                'min-h-[44px] min-w-[44px] flex items-center gap-2 rounded-[var(--radius-sm)] px-4 text-sm border transition-colors',
                filtersOpen
                  ? 'border-[var(--color-interactive)] text-[var(--color-interactive)] bg-[var(--color-surface)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
              ].join(' ')}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filtrar
            </button>
          )}
          <div className="flex items-center gap-2">
            {/* Disponible en todas las vistas (día, semana y mes). Desde Mes el
                turno se crea con la fecha ancla como prefill (newTurnoPrefill=null
                → NewTurnoModal usa date={isoDate}). */}
            <button
              onClick={() => { setNewTurnoPrefill(null); setShowNewTurnoModal(true) }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-white bg-[var(--color-interactive)] hover:opacity-90 transition-opacity"
              aria-label={turnoLabel}
              data-tour="new-appointment-btn"
            >
              + {turnoLabel}
            </button>
            {showFilters && secondaryVisible && (
              <button
                onClick={() => setShowNewPaqueteModal(true)}
                className="min-h-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-[var(--color-interactive)] border border-[var(--color-interactive)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label="Nuevo paquete"
              >
                + Nuevo paquete
              </button>
            )}
            <nav
              className="flex items-center gap-1"
              aria-label="Navegación de fecha"
            >
              <button
                onClick={() => router.push(buildFechaUrl(prevISO))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label={vistaActiva === 'dia' ? 'Día anterior' : vistaActiva === 'semana' ? 'Semana anterior' : 'Mes anterior'}
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
                onClick={() => router.push(buildFechaUrl(nextISO))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label={vistaActiva === 'dia' ? 'Día siguiente' : vistaActiva === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}
              >
                Siguiente →
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Contenedor de los filtros. La leyenda de ESTADOS se retiró de la agenda
          (decisión 2026-07-14): el color del calendario pasó a ser el color
          MANUAL que elige la recepcionista (paleta muda del turnero), no el
          estado — ya no hay un código de color de estado que explicar acá. El
          estado se sigue viendo en el detalle del turno (TurnoDetailModal). */}
      {showFilters && (
        <div className="mb-3 space-y-2">
          {/* Botones de Servicio: SIEMPRE visibles (recepción y admin) — pedido
              ISADI 2026-07-14. Es la forma principal de filtrar la agenda de un
              toque, no debe quedar escondida detrás de "Filtrar" como el resto
              de los controles secundarios. */}
          <AgendaServiceButtons
            serviceId={serviceId}
            onServiceChange={handleServiceChange}
            areaFocus={areaFocus}
            isReceptionist={isReceptionist}
            receptionGroup={receptionGroup}
            onReceptionGroupChange={handleReceptionGroupChange}
          />
          <div id="agenda-secondary-controls">
            {secondaryVisible && (
              <AgendaFilters
                professionalId={professionalId}
                serviceId={serviceId}
                onProfessionalChange={handleProfessionalChange}
                onClear={handleClearFilters}
                showFilters={showFilters}
                areaFocus={areaFocus}
                onAreaFocusChange={handleAreaFocusChange}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
      {vistaActiva === 'dia' ? (
        <>
          <KPIStrip appointments={focusedAppointments} isLoading={isLoading} isError={isError} />
          {!tenantConfigPending && !usesNativeCalendar && (
            <>
              <SyncStatusBanner appointments={focusedAppointments} date={isoDate} />
              <GCalDegradationBanner status={gcalStatus} />
            </>
          )}
          <CalendarView
            date={isoDate}
            appointments={focusedAppointments}
            isLoading={isLoading}
            isError={isError}
            onRefetch={refetch}
            onReschedule={handleOpenReschedule}
            onEmptyCellClick={handleEmptyCellClick}
            onAppointmentClick={handleAppointmentClick}
          />
          <TurnoDetailModal
            open={selectedAppointmentDetail !== null}
            appointment={selectedAppointmentDetail}
            onClose={() => setSelectedAppointmentDetail(null)}
            onReschedule={handleRescheduleFromDetail}
            date={isoDate}
          />
        </>
      ) : (
        <>
          <CalendarViewRangeReadOnly
            view={vistaActiva === 'semana' ? 'week' : 'month'}
            date={isoDate}
            appointments={focusedRangeAppointments}
            isLoading={rangeLoading}
            isError={rangeError}
            onRefetch={rangeRefetch}
            onAppointmentClick={handleAppointmentClick}
            onEmptyCellClick={handleEmptyCellClick}
            dayStatusMap={dayStatusMap}
            onDayStatusClick={handleDayStatusClick}
          />
          <TurnoDetailModal
            open={selectedAppointmentDetail !== null}
            appointment={selectedAppointmentDetail}
            onClose={() => setSelectedAppointmentDetail(null)}
            onReschedule={handleRescheduleFromDetail}
            date={isoDate}
          />
        </>
      )}

      </div>

      <NewTurnoModal
        open={showNewTurnoModal}
        onClose={handleCloseNewTurno}
        date={newTurnoPrefill?.date ?? isoDate}
        initialServiceId={newTurnoPrefill?.serviceId}
        initialProfessionalId={newTurnoPrefill?.professionalId}
        initialDate={newTurnoPrefill?.date}
        initialTimeHHmm={newTurnoPrefill?.timeHHmm}
        isReceptionist={isReceptionist}
      />
      <RescheduleTurnoModal
        open={showRescheduleTurnoModal}
        onClose={handleCloseReschedule}
        appointment={selectedAppointmentForReschedule}
        date={isoDate}
      />
      {showFilters && (
        <NewPaqueteModal
          open={showNewPaqueteModal}
          onClose={() => setShowNewPaqueteModal(false)}
        />
      )}
      <DayStatusModal
        open={decidingDate !== null}
        date={decidingDate}
        entry={decidingDate ? dayStatusMap[decidingDate] : undefined}
        onClose={handleCloseDayStatus}
        onDecide={handleDecideDayStatus}
        isSaving={setDayStatus.isPending}
      />
    </section>
  )
}

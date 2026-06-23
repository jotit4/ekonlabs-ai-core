'use client'

import { useQuery } from '@tanstack/react-query'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  treatmentProgress,
  TREATMENT_STATUS_LABELS,
  type TreatmentStatus,
  type TreatmentWithSessions,
} from '@/types/treatments'
import { STATUS_LABELS, type AppointmentStatus } from '@/types/appointments'
import { TreatmentPlanPanel } from './TreatmentPlanPanel'
import { SessionNotePanel } from './SessionNotePanel'

interface PaquetesTrackingProps {
  patientId: string
}

// Formatea una fecha ISO con guarda de invalidez. Devuelve '—' si no parsea.
function fmtDate(iso: string | null | undefined, pattern: string): string {
  if (!iso) return '—'
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return '—'
  return format(parsed, pattern, { locale: es })
}

function statusLabel(status: string): string {
  return TREATMENT_STATUS_LABELS[status as TreatmentStatus] ?? status
}

function sessionStatusLabel(status: string): string {
  return STATUS_LABELS[status as AppointmentStatus] ?? status
}

/**
 * Sección "Paquetes / Tratamientos" de la ficha del paciente — SOLO LECTURA (Story 13.5).
 * Lee `treatments` por `patient_id` con join a servicio, profesional y sus sesiones
 * (reverse-join appointments(package_id)) vía createSupabaseBrowserClient() + RLS 038.
 * NO `.eq('tenant_id')` (AR14): la RLS filtra por tenant. NO admin.ts (AR15).
 * NO muta `sessions_remaining` ni reprograma (eso es 13.4 / 13.6).
 */
export function PaquetesTracking({ patientId }: PaquetesTrackingProps) {
  const supabase = createSupabaseBrowserClient()

  const { data, isPending, isError } = useQuery<TreatmentWithSessions[]>({
    queryKey: ['treatments', 'by-patient', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatments')
        .select(
          '*, services(name), professionals(name), appointments(appointment_id, session_index, start_at, end_at, status)',
        )
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TreatmentWithSessions[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!patientId,
  })

  if (isPending) {
    return (
      <div role="status" aria-label="Cargando paquetes" className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded bg-[#f5f5f7]" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="py-6 text-sm text-[var(--color-text-secondary)]">
        Error al cargar los paquetes. Recargá la página.
      </div>
    )
  }

  const treatments = data ?? []

  if (treatments.length === 0) {
    return (
      <p className="py-6 text-sm text-[var(--color-text-secondary)]">
        Este paciente no tiene paquetes.
      </p>
    )
  }

  return (
    <ul role="list" className="space-y-4" aria-label="Paquetes del paciente">
      {treatments.map((t) => {
        // Contador HONESTO derivado de las sesiones reales del paquete (no de
        // total_sessions − sessions_remaining, que estaba sobrecargado).
        const { realizadas, agendadas, total, por_agendar } = treatmentProgress(t)
        const sessions = (t.appointments ?? [])
          .slice()
          .sort((a, b) => (a.session_index ?? 0) - (b.session_index ?? 0))

        return (
          <li
            key={t.treatment_id}
            className="rounded-[8px] border border-[var(--color-border)] p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                {realizadas} de {total} sesiones realizadas
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {statusLabel(t.status)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {agendadas} agendadas
              {por_agendar > 0 ? ` · faltan agendar ${por_agendar}` : ' · todas agendadas'}
            </p>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
              <dt>Servicio</dt>
              <dd className="text-[var(--color-text-primary)]">{t.services?.name ?? '—'}</dd>
              <dt>Profesional</dt>
              <dd className="text-[var(--color-text-primary)]">{t.professionals?.name ?? '—'}</dd>
              <dt>Vencimiento</dt>
              <dd className="text-[var(--color-text-primary)]">
                {t.expires_at ? fmtDate(t.expires_at, "d 'de' MMMM 'de' yyyy") : 'Sin vencimiento'}
              </dd>
            </dl>

            {sessions.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                  Sesiones
                </p>
                <ul role="list" className="space-y-1">
                  {sessions.map((s) => (
                    <li
                      key={s.appointment_id}
                      className="flex flex-wrap items-baseline gap-x-2 text-xs"
                    >
                      <span className="font-medium text-[var(--color-text-primary)]">
                        Sesión {s.session_index ?? '?'}
                      </span>
                      <span className="text-[var(--color-text-secondary)]">
                        {fmtDate(s.start_at, "d/MM/yyyy · HH:mm")}
                      </span>
                      <span className="text-[var(--color-text-secondary)]">
                        {sessionStatusLabel(s.status)}
                      </span>
                      {/* Evolución de la sesión (Story 14.3 — HCE): auto-gateado
                          por rol (null si no doctor/admin) — vista por tratamiento
                          de la ficha: cada sesión expande su evolución in situ. */}
                      <div className="w-full">
                        <SessionNotePanel
                          appointmentId={s.appointment_id}
                          sessionIndex={s.session_index}
                          totalSessions={t.total_sessions}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Plan de tratamiento (Story 14.2 — HCE): el panel se auto-gatea
                por rol (null si no doctor/admin) — sin lógica de rol acá.
                sessionsRemaining (Story 14.6): la confirmación del alta advierte
                si quedan sesiones restantes en el paquete. */}
            <TreatmentPlanPanel
              treatmentId={t.treatment_id}
              sessionsRemaining={t.sessions_remaining}
            />
          </li>
        )
      })}
    </ul>
  )
}

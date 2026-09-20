'use client'

import { useState, useEffect } from 'react'
import { parseISO, isValid, format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAgentContext } from '@/hooks/use-agent-context'
import { ARGENTINA_TIME_ZONE } from '@/lib/utils/argentina-date'
import type { ConversationStatus } from '@/types/conversations'
import { PatientQuickDrawer } from './PatientQuickDrawer'

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formatea el "horario solicitado" (slot_requested/availability_info) a texto
 * legible en horario de Argentina — hallazgo 8: antes se mostraba el ISO crudo
 * tal cual (ej. "2026-07-29T12:00:00+00:00"), y además esa hora está en UTC:
 * 12:00 UTC son las 09:00 en Mendoza, así que leído literal daba una hora
 * equivocada.
 *
 * - Fecha con hora (instante con offset, ej. slot_requested de un turno
 *   confirmado): se convierte a America/Argentina/Buenos_Aires.
 * - Fecha sola (YYYY-MM-DD, sin componente horario): se formatea tal cual sin
 *   aplicar zona horaria — convertirla correría el día (medianoche UTC no es
 *   medianoche en Argentina).
 * - Cualquier otro texto (ej. "Prefiere por la mañana" en availability_info,
 *   que es texto libre, no una fecha): se muestra tal cual.
 */
// Exportado solo para poder testear la DECISIÓN de rama sin depender de la
// zona horaria de la máquina donde corren los tests: en una máquina en
// Argentina las dos ramas dan el mismo resultado para una fecha sola, así que
// un test de salida no probaría nada.
export function isDateOnlySlot(value: string): boolean {
  return DATE_ONLY_RE.test(value)
}

function formatSlotLabel(value: string): string {
  if (isDateOnlySlot(value)) {
    const parsed = parseISO(value)
    return isValid(parsed) ? format(parsed, 'EEEE d/MM', { locale: es }) : value
  }
  const parsed = parseISO(value)
  if (!isValid(parsed)) return value
  return formatInTimeZone(parsed, ARGENTINA_TIME_ZONE, 'EEEE d/MM, HH:mm', { locale: es })
}

// ─── Subcomponentes internos ─────────────────────────────────────────────────

function ContextField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  const hasValue = value != null && value.trim() !== ''

  return (
    <div style={{ marginBottom: 12 }} aria-label={label}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          display: 'block',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: hasValue ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          background: hasValue ? 'var(--color-surface)' : 'transparent',
          border: `1px solid var(--color-border)`,
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        {hasValue ? (
          <>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 5l2.5 2.5L8 3"
                stroke="var(--color-status-ok)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {value}
          </>
        ) : (
          // El contexto se cargó bien pero el agente aún no capturó este dato en la
          // conversación. Es distinto de un error de carga (ver bloque !context abajo).
          'Sin datos aún'
        )}
      </span>
    </div>
  )
}

function ContextPanelSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div
            className="animate-pulse rounded bg-[#f5f5f7]"
            style={{ height: 10, width: '40%', marginBottom: 4 }}
          />
          <div
            className="animate-pulse rounded bg-[#f5f5f7]"
            style={{ height: 22, width: '70%' }}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

interface PatientContextPanelProps {
  phone: string
  conversationStatus?: ConversationStatus
}

export function PatientContextPanel({ phone, conversationStatus }: PatientContextPanelProps) {
  const { context, isLoading, isError } = useAgentContext(phone)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)

  useEffect(() => {
    if (!phone) {
      setPatientId(null)
      return
    }
    const supabase = createSupabaseBrowserClient()
    supabase
      .from('patients')
      .select('patient_id')
      .eq('phone_number', phone)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.patient_id) {
          setPatientId(data.patient_id)
        } else {
          setPatientId(null)
        }
      })
  }, [phone])

  if (isLoading) {
    return (
      <aside role="complementary" aria-label="Contexto de la conversación">
        <ContextPanelSkeleton />
      </aside>
    )
  }

  const isResolved =
    conversationStatus === 'resolved' || conversationStatus === 'human_takeover'

  // "Horario solicitado" (hallazgo 8): slot_requested o, si no hay, texto libre
  // de availability_info. Formateado a horario de Argentina — ver formatSlotLabel.
  const rawSlot = context?.slot_requested ?? context?.availability_info
  const slotLabel = rawSlot ? formatSlotLabel(rawSlot) : rawSlot

  return (
    <aside
      role="complementary"
      data-tour="agent-context-panel"
      aria-label="Contexto de la conversación"
      style={{
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        borderLeft: '1px solid var(--color-border)',
      }}
    >
      {/* Cabecera */}
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: 16,
        }}
      >
        Contexto del agente
      </h2>

      {/* Badge de estado resuelto */}
      {isResolved && (
        <div
          style={{
            display: 'inline-flex',
            fontSize: 11,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: '2px 8px',
            color: 'var(--color-text-secondary)',
            marginBottom: 16,
          }}
        >
          {conversationStatus === 'resolved' ? 'Conversación resuelta' : 'En control humano'}
        </div>
      )}

      {/* Estado sin contexto: distingue error de carga vs conversación sin datos aún.
          - isError: la request falló (red/servidor) → mensaje de error real.
          - !context sin error: se cargó bien pero el agente todavía no capturó nada
            (conversación nueva, sin paciente ni contexto vivo). */}
      {isError ? (
        <p style={{ fontSize: 14, color: 'var(--color-status-error, var(--color-text-secondary))' }}>
          No se pudo cargar el contexto
        </p>
      ) : !context ? (
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          El agente aún no capturó datos de esta conversación
        </p>
      ) : (
        <>
          {/* Sección: Paciente */}
          {(context.patient_name ?? context.phone_number) && (
            <div style={{ marginBottom: 16 }}>
              <p
                onClick={() => {
                  if (patientId) {
                    setDrawerOpen(true)
                  }
                }}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                  cursor: patientId ? 'pointer' : 'default',
                  textDecoration: patientId ? 'underline' : 'none',
                }}
              >
                {context.patient_name ?? context.phone_number}
              </p>
              {context.patient_name && context.phone_number && (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    margin: '2px 0 0',
                  }}
                >
                  {context.phone_number}
                </p>
              )}
            </div>
          )}

          <ContextField label="Qué quiere hacer" value={context.detected_intent} />
          <ContextField label="DNI" value={context.dni} />
          <ContextField label="Servicio solicitado" value={context.service_requested} />
          <ContextField label="Horario solicitado" value={slotLabel} />
          <ContextField label="Obra social" value={context.obra_social} />

          {/* Bloqueo actual: solo si tiene valor */}
          {context.current_block && (
            <ContextField label="Bloqueo actual" value={context.current_block} />
          )}
        </>
      )}

      {/* Ficha Rápida Drawer */}
      {patientId && (
        <PatientQuickDrawer
          patientId={patientId}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </aside>
  )
}

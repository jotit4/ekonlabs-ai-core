'use client'

import { useAgentContext } from '@/hooks/use-agent-context'
import type { ConversationStatus } from '@/types/conversations'

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
          'Sin datos'
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
  const { context, isLoading } = useAgentContext(phone)

  if (isLoading) {
    return (
      <aside role="complementary" aria-label="Contexto de la conversación">
        <ContextPanelSkeleton />
      </aside>
    )
  }

  const isResolved =
    conversationStatus === 'resolved' || conversationStatus === 'human_takeover'

  return (
    <aside
      role="complementary"
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

      {/* Estado sin contexto / error */}
      {!context ? (
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          No se pudo cargar el contexto
        </p>
      ) : (
        <>
          {/* Sección: Paciente */}
          {(context.patient_name ?? context.phone_number) && (
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  margin: 0,
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

          <ContextField label="Intención detectada" value={context.detected_intent} />
          <ContextField label="DNI" value={context.dni} />
          <ContextField label="Servicio solicitado" value={context.service_requested} />
          <ContextField
            label="Slot / Disponibilidad"
            value={context.slot_requested ?? context.availability_info}
          />
          <ContextField label="Obra social" value={context.obra_social} />

          {/* Bloqueo actual: solo si tiene valor */}
          {context.current_block && (
            <ContextField label="Bloqueo actual" value={context.current_block} />
          )}
        </>
      )}
    </aside>
  )
}

'use client'

import { format, isToday, isYesterday, isThisWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusDot } from '@/components/shared/StatusDot'
import type { StatusDotVariant } from '@/components/shared/StatusDot'
import type { ConversationSummary, ConversationStatus, ConfidenceLevel } from '@/types/conversations'

// ─── Helpers de mapeo estado → StatusDot ─────────────────────────────────────

// Semáforo de la bandeja (decisión de negocio 2026-06):
// 🟡 warning  = "atendé, te necesita" (accionable / needs_intervention)
// 🟢 active   = el agente la maneja solo (incluye confianza media)
// 🔵 human    = humano en control (takeover)
// ⚪ inactive = cerrada
function statusToVariant(status: ConversationStatus, confidenceLevel: ConfidenceLevel): StatusDotVariant {
  switch (status) {
    case 'needs_intervention':
      return 'warning'
    case 'human_takeover':
      return 'human'
    case 'resolved':
      return 'inactive'
    case 'ai_active':
      // Verde mientras el agente la maneja — confianza media incluida.
      // Confianza baja es accionable → amarillo.
      if (confidenceLevel === 'low') return 'warning'
      return 'active'
  }
}

function statusToLabel(status: ConversationStatus, confidenceLevel: ConfidenceLevel): string {
  switch (status) {
    case 'needs_intervention':
      return 'Necesita intervención'
    case 'human_takeover':
      return 'Humano en control'
    case 'resolved':
      return 'Resuelta'
    case 'ai_active':
      if (confidenceLevel === 'high') return 'IA activa'
      if (confidenceLevel === 'medium') return 'Confianza media'
      return 'Necesita ayuda'
  }
}

function statusToConfidenceText(status: ConversationStatus, confidenceLevel: ConfidenceLevel): string {
  switch (status) {
    case 'needs_intervention':
      return 'Requiere atención'
    case 'human_takeover':
      return 'Requiere atención'
    case 'resolved':
      return 'Resuelta'
    case 'ai_active':
      if (confidenceLevel === 'high') return 'Agente activo'
      if (confidenceLevel === 'medium') return 'Revisando…'
      return 'Requiere atención'
  }
}

// ─── Timestamp relativo estilo Chatwoot ──────────────────────────────────────
//
// Hoy      → hora "HH:mm"   (14:30)
// Ayer     → "Ayer"
// Esta sem.→ día abreviado  ("lun", "mar"…)  — semana arranca el lunes (locale es)
// Más viejo→ fecha corta    "dd/MM"          (14/05)
export function formatRelativeTimestamp(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''

  if (isToday(date)) {
    return format(date, 'HH:mm', { locale: es })
  }
  if (isYesterday(date)) {
    return 'Ayer'
  }
  // weekStartsOn: 1 (lunes) — consistente con la convención AR/es del dashboard
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return format(date, 'EEE', { locale: es })
  }
  return format(date, 'dd/MM', { locale: es })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ConversationListItemProps {
  conversation: ConversationSummary
  isSelected?: boolean
  onSelect: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLLIElement>) => void
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function ConversationListItem({
  conversation,
  isSelected = false,
  onSelect,
  onKeyDown,
}: ConversationListItemProps) {
  const variant = statusToVariant(conversation.status, conversation.confidence_level)
  const dotLabel = statusToLabel(conversation.status, conversation.confidence_level)
  const confidenceText = statusToConfidenceText(conversation.status, conversation.confidence_level)
  const initials = getInitials(conversation.patient_name)
  const timestamp = formatRelativeTimestamp(conversation.last_message_at)
  const preview =
    conversation.last_message_preview.length > 80
      ? conversation.last_message_preview.slice(0, 80) + '…'
      : conversation.last_message_preview

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
    onKeyDown?.(e)
  }

  return (
    <li
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        minHeight: 72,
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--color-surface)' : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--color-interactive)'
          : '2px solid transparent',
        transition: 'background-color 120ms, border-color 120ms',
      }}
      className="hover:bg-[var(--color-surface)]"
    >
      {/* StatusDot — punto 9px de color de estado */}
      <StatusDot variant={variant} label={dotLabel} />

      {/* Avatar con iniciales */}
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          flexShrink: 0,
          border: '1px solid var(--color-border)',
        }}
      >
        {initials}
      </div>

      {/* Contenido principal */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Nombre + timestamp */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: conversation.is_unread ? 600 : 400,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {conversation.patient_name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {conversation.is_unread && (
              <span
                aria-label="No leído"
                role="status"
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#0071e3',
                }}
              />
            )}
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              {timestamp}
            </span>
          </div>
        </div>

        {/* Preview del último mensaje */}
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: '2px 0',
          }}
        >
          {preview || '—'}
        </p>

        {/* Confidence label en español — NO "confidence score" */}
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          {confidenceText}
        </span>
      </div>
    </li>
  )
}

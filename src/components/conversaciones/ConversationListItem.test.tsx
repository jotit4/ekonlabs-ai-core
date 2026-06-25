import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConversationListItem, formatRelativeTimestamp } from './ConversationListItem'
import type { ConversationSummary } from '@/types/conversations'

// ─── Datos de prueba ─────────────────────────────────────────────────────────

function makeConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'phone-1',
    phone_number: '+5491133334444',
    patient_name: 'María García',
    status: 'ai_active',
    confidence_level: 'high',
    last_message_preview: 'Hola, quiero un turno para la semana que viene',
    last_message_at: '2026-05-11T14:30:00.000Z',
    is_unread: false,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConversationListItem', () => {
  const onSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('needs_intervention → StatusDot AMARILLO (warning, "atendé, te necesita"), label "Necesita intervención"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'needs_intervention', confidence_level: 'low' })}
        onSelect={onSelect}
      />
    )
    const dot = screen.getByRole('img', { name: /necesita intervención/i })
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#ff9f0a' }) // amarillo = accionable
  })

  it('needs_intervention → muestra texto "Requiere atención"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'needs_intervention', confidence_level: 'low' })}
        onSelect={onSelect}
      />
    )
    expect(screen.getByText('Requiere atención')).toBeInTheDocument()
  })

  it('human_takeover → muestra texto "Requiere atención"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'human_takeover', confidence_level: 'medium' })}
        onSelect={onSelect}
      />
    )
    expect(screen.getByText('Requiere atención')).toBeInTheDocument()
  })

  it('ai_active + confidence_level high → StatusDot VERDE (active), label "IA activa"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'ai_active', confidence_level: 'high' })}
        onSelect={onSelect}
      />
    )
    const dot = screen.getByRole('img', { name: /IA activa/i })
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#34c759' }) // verde = el agente la maneja
  })

  it('ai_active + confidence_level medium → StatusDot VERDE (el agente la maneja), label "Confianza media"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'ai_active', confidence_level: 'medium' })}
        onSelect={onSelect}
      />
    )
    const dot = screen.getByRole('img', { name: /confianza media/i })
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#34c759' }) // verde — confianza media incluida
  })

  it('human_takeover → StatusDot AZUL (human), label "Humano en control"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'human_takeover', confidence_level: 'medium' })}
        onSelect={onSelect}
      />
    )
    const dot = screen.getByRole('img', { name: /humano en control/i })
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#0071e3' }) // azul = humano en control
  })

  it('resolved → StatusDot inactive, label "Resuelta"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ status: 'resolved', confidence_level: 'high' })}
        onSelect={onSelect}
      />
    )
    expect(screen.getByRole('img', { name: /resuelta/i })).toBeInTheDocument()
  })

  it('is_unread true → nombre con fontWeight 600', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ is_unread: true })}
        onSelect={onSelect}
      />
    )
    const nameEl = screen.getByText('María García')
    expect(nameEl).toHaveStyle({ fontWeight: 600 })
  })

  it('is_unread false → nombre sin fontWeight 600', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ is_unread: false })}
        onSelect={onSelect}
      />
    )
    const nameEl = screen.getByText('María García')
    expect(nameEl).toHaveStyle({ fontWeight: 400 })
  })

  it('is_unread true → muestra el punto azul de no leído', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ is_unread: true })}
        onSelect={onSelect}
      />
    )
    const dot = screen.getByRole('status', { name: /no leído/i })
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#0071e3' })
  })

  it('is_unread false → NO muestra el punto azul de no leído', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ is_unread: false })}
        onSelect={onSelect}
      />
    )
    expect(screen.queryByRole('status', { name: /no leído/i })).not.toBeInTheDocument()
  })

  it('timestamp de HOY muestra formato HH:mm', () => {
    // Un mensaje de hace 1 hora cae siempre en "hoy" → debe formatearse como HH:mm
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    render(
      <ConversationListItem
        conversation={makeConversation({ last_message_at: oneHourAgo })}
        onSelect={onSelect}
      />
    )
    // El valor exacto depende del timezone del entorno; verificamos formato HH:mm
    const timestampEls = screen.getAllByText(/^\d{2}:\d{2}$/)
    expect(timestampEls.length).toBeGreaterThan(0)
  })

  it('preview trunca a 80 chars con ellipsis cuando el texto es largo', () => {
    const longPreview = 'A'.repeat(100)
    render(
      <ConversationListItem
        conversation={makeConversation({ last_message_preview: longPreview })}
        onSelect={onSelect}
      />
    )
    // Busca el texto truncado — 80 chars de 'A' seguidos de '…'
    const expected = 'A'.repeat(80) + '…'
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('click dispara onSelect()', async () => {
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation()}
        onSelect={onSelect}
      />
    )
    await user.click(screen.getByRole('option'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('isSelected true → aria-selected="true"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation()}
        isSelected={true}
        onSelect={onSelect}
      />
    )
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true')
  })

  it('isSelected false → aria-selected="false"', () => {
    render(
      <ConversationListItem
        conversation={makeConversation()}
        isSelected={false}
        onSelect={onSelect}
      />
    )
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'false')
  })
})

// ─── formatRelativeTimestamp (P1 — timestamp relativo estilo Chatwoot) ─────────

describe('formatRelativeTimestamp', () => {
  // Ancla: miércoles 2026-05-13 15:00 local. Usamos fechas locales (no UTC) para
  // que isToday/isYesterday/isThisWeek no dependan del timezone del runner.
  const NOW = new Date(2026, 4, 13, 15, 0, 0) // mié 13 may 2026

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hoy → formato HH:mm', () => {
    const todayMorning = new Date(2026, 4, 13, 9, 5, 0).toISOString()
    expect(formatRelativeTimestamp(todayMorning)).toBe('09:05')
  })

  it('ayer → "Ayer"', () => {
    const yesterday = new Date(2026, 4, 12, 20, 0, 0).toISOString()
    expect(formatRelativeTimestamp(yesterday)).toBe('Ayer')
  })

  it('esta semana (no hoy/ayer) → día abreviado en español', () => {
    // Lunes 11 may 2026 — misma semana ISO (lun-dom) que el miércoles ancla
    const monday = new Date(2026, 4, 11, 12, 0, 0).toISOString()
    expect(formatRelativeTimestamp(monday)).toBe('lun')
  })

  it('más viejo que esta semana → fecha corta dd/MM', () => {
    const older = new Date(2026, 3, 14, 10, 0, 0).toISOString() // 14 abr 2026
    expect(formatRelativeTimestamp(older)).toBe('14/04')
  })

  it('fecha inválida → string vacío (no rompe)', () => {
    expect(formatRelativeTimestamp('no-es-una-fecha')).toBe('')
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ConversationListItem } from './ConversationListItem'
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

  it('timestamp muestra formato HH:mm', () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ last_message_at: '2026-05-11T14:30:00.000Z' })}
        onSelect={onSelect}
      />
    )
    // El timestamp se formatea como HH:mm — el valor exacto depende del timezone del entorno
    // Verificamos que existe un elemento con formato de hora (2 dígitos:2 dígitos)
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

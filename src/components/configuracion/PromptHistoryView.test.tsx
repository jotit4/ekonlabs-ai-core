import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SystemPromptHistoryEntry } from '@/types/agente'

// ── Mock usePromptHistory ─────────────────────────────────────────────────────

const mockUsePromptHistory = vi.fn()

vi.mock('@/hooks/use-prompt-history', () => ({
  usePromptHistory: () => mockUsePromptHistory(),
}))

import { PromptHistoryView } from './PromptHistoryView'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<SystemPromptHistoryEntry> = {}): SystemPromptHistoryEntry {
  return {
    id: 'hist-1',
    tenant_id: 'tenant-1',
    user_id: 'abcdef12-0000-0000-0000-000000000000',
    previous_content: 'prompt anterior',
    new_content: 'prompt nuevo',
    changed_at: '2026-05-12T10:30:00Z',
    ...overrides,
  }
}

function makeDefaultState(overrides = {}) {
  return {
    history: [makeEntry()],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PromptHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending=true', () => {
    mockUsePromptHistory.mockReturnValue(makeDefaultState({ isPending: true, history: [] }))
    render(<PromptHistoryView />)
    expect(screen.getByRole('status', { name: /cargando historial de cambios/i })).toBeInTheDocument()
  })

  it('muestra banner de error y botón Reintentar cuando isError=true', () => {
    const mockRefetch = vi.fn()
    mockUsePromptHistory.mockReturnValue(makeDefaultState({ isError: true, history: [], refetch: mockRefetch }))
    render(<PromptHistoryView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('llama a refetch al hacer click en Reintentar', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn()
    mockUsePromptHistory.mockReturnValue(makeDefaultState({ isError: true, history: [], refetch: mockRefetch }))
    render(<PromptHistoryView />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('muestra "No hay cambios de prompt registrados" cuando history=[]', () => {
    mockUsePromptHistory.mockReturnValue(makeDefaultState({ history: [] }))
    render(<PromptHistoryView />)
    expect(screen.getByText(/no hay cambios de prompt registrados/i)).toBeInTheDocument()
  })

  it('no muestra placeholders decorativos en estado vacío', () => {
    mockUsePromptHistory.mockReturnValue(makeDefaultState({ history: [] }))
    render(<PromptHistoryView />)
    // No debe haber lista de entradas
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renderiza lista de entradas cuando hay historial', () => {
    mockUsePromptHistory.mockReturnValue(makeDefaultState())
    render(<PromptHistoryView />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    // El botón "Ver cambio" indica que hay una entrada
    expect(screen.getByRole('button', { name: /ver cambio/i })).toBeInTheDocument()
  })

  it('cada entrada muestra fecha formateada y user_id truncado', () => {
    mockUsePromptHistory.mockReturnValue(makeDefaultState())
    render(<PromptHistoryView />)
    // Fecha formateada con date-fns en español
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    // UUID truncado a 8 chars + '...'
    expect(screen.getByText(/abcdef12\.\.\./i)).toBeInTheDocument()
  })

  it('toggle expand muestra previous_content y new_content', async () => {
    const user = userEvent.setup()
    mockUsePromptHistory.mockReturnValue(makeDefaultState())
    render(<PromptHistoryView />)

    const toggleBtn = screen.getByRole('button', { name: /ver cambio/i })
    await user.click(toggleBtn)

    expect(screen.getByText('prompt anterior')).toBeInTheDocument()
    expect(screen.getByText('prompt nuevo')).toBeInTheDocument()
    expect(screen.getByText('Antes')).toBeInTheDocument()
    expect(screen.getByText('Después')).toBeInTheDocument()
  })

  it('toggle colapsa la entrada al hacer click de nuevo', async () => {
    const user = userEvent.setup()
    mockUsePromptHistory.mockReturnValue(makeDefaultState())
    render(<PromptHistoryView />)

    const toggleBtn = screen.getByRole('button', { name: /ver cambio/i })
    await user.click(toggleBtn)
    expect(screen.getByText('Ocultar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ocultar/i }))
    expect(screen.queryByText('prompt anterior')).not.toBeInTheDocument()
  })

  it('si previous_content es null → muestra "(sin override previo — primera configuración)"', async () => {
    const user = userEvent.setup()
    mockUsePromptHistory.mockReturnValue(
      makeDefaultState({ history: [makeEntry({ previous_content: null })] })
    )
    render(<PromptHistoryView />)

    const toggleBtn = screen.getByRole('button', { name: /ver cambio/i })
    await user.click(toggleBtn)

    expect(screen.getByText('(sin override previo — primera configuración)')).toBeInTheDocument()
  })
})

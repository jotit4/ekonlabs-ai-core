import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockResolve = vi.fn()
const mockReopen = vi.fn()
const mockUseResolve = vi.fn()

vi.mock('@/hooks/use-resolve', () => ({
  useResolve: () => mockUseResolve(),
}))

import { ResolveControl } from './ResolveControl'

const DEFAULT_HOOK = {
  resolve: mockResolve,
  reopen: mockReopen,
  isPending: false,
}

describe('ResolveControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseResolve.mockReturnValue(DEFAULT_HOOK)
  })

  it('cuando status NO es resolved → muestra "Marcar como resuelta"', () => {
    render(<ResolveControl phone="+5491111111111" conversationStatus="ai_active" />)
    expect(screen.getByRole('button', { name: /resolver conversación/i })).toBeInTheDocument()
    expect(screen.getByText(/Marcar como resuelta/i)).toBeInTheDocument()
  })

  it('cuando status es resolved → muestra "Reabrir conversación"', () => {
    render(<ResolveControl phone="+5491111111111" conversationStatus="resolved" />)
    expect(screen.getByRole('button', { name: /reabrir conversación/i })).toBeInTheDocument()
    expect(screen.getByText(/Reabrir conversación/i)).toBeInTheDocument()
  })

  it('click en "Marcar como resuelta" llama a resolve con el phone', async () => {
    const user = userEvent.setup()
    render(<ResolveControl phone="+5491111111111" conversationStatus="ai_active" />)
    await user.click(screen.getByRole('button'))
    expect(mockResolve).toHaveBeenCalledWith('+5491111111111')
    expect(mockReopen).not.toHaveBeenCalled()
  })

  it('click en "Reabrir" llama a reopen con el phone', async () => {
    const user = userEvent.setup()
    render(<ResolveControl phone="+5491111111111" conversationStatus="resolved" />)
    await user.click(screen.getByRole('button'))
    expect(mockReopen).toHaveBeenCalledWith('+5491111111111')
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('botón deshabilitado mientras isPending=true', () => {
    mockUseResolve.mockReturnValue({ ...DEFAULT_HOOK, isPending: true })
    render(<ResolveControl phone="+5491111111111" conversationStatus="ai_active" />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('muestra "Guardando…" mientras isPending=true', () => {
    mockUseResolve.mockReturnValue({ ...DEFAULT_HOOK, isPending: true })
    render(<ResolveControl phone="+5491111111111" conversationStatus="ai_active" />)
    expect(screen.getByText(/Guardando/i)).toBeInTheDocument()
  })
})

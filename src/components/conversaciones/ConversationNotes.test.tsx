import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUseConversationNotes = vi.fn()
vi.mock('@/hooks/use-conversation-notes', () => ({
  useConversationNotes: () => mockUseConversationNotes(),
}))

import { ConversationNotes } from './ConversationNotes'
import type { ConversationNote } from '@/types/conversations'

const NOW = '2026-06-25T10:00:00.000Z'

function makeNote(overrides: Partial<ConversationNote> = {}): ConversationNote {
  return {
    id: 'note-1',
    tenant_id: 'tenant-1',
    phone_number: '+5491111111111',
    author_user: 'user-1',
    author_name: 'Ana García',
    body: 'Nota de prueba interna',
    created_at: NOW,
    ...overrides,
  }
}

const DEFAULT_HOOK = {
  notes: [],
  isLoading: false,
  isError: false,
  addNote: vi.fn(),
  isAdding: false,
  deleteNote: vi.fn(),
  isDeleting: false,
}

describe('ConversationNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseConversationNotes.mockReturnValue(DEFAULT_HOOK)
  })

  it('renderiza el título "Notas internas"', () => {
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByRole('heading', { name: /notas internas/i })).toBeInTheDocument()
  })

  it('muestra el aviso de privacidad "no se envían al paciente"', () => {
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText(/no se envían al paciente/i)).toBeInTheDocument()
  })

  it('muestra "Sin notas aún" cuando la lista está vacía', () => {
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText(/sin notas aún/i)).toBeInTheDocument()
  })

  it('muestra "Cargando notas…" mientras isLoading=true', () => {
    mockUseConversationNotes.mockReturnValue({ ...DEFAULT_HOOK, isLoading: true })
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText(/cargando notas/i)).toBeInTheDocument()
  })

  it('muestra mensaje de error cuando isError=true', () => {
    mockUseConversationNotes.mockReturnValue({ ...DEFAULT_HOOK, isError: true })
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText(/no se pudieron cargar/i)).toBeInTheDocument()
  })

  it('renderiza las notas con cuerpo y autor', () => {
    mockUseConversationNotes.mockReturnValue({
      ...DEFAULT_HOOK,
      notes: [makeNote({ body: 'Esta es mi nota', author_name: 'Ana García' })],
    })
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText('Esta es mi nota')).toBeInTheDocument()
    expect(screen.getByText(/Ana García/)).toBeInTheDocument()
  })

  it('botón "Borrar" visible solo para el autor de la nota', () => {
    mockUseConversationNotes.mockReturnValue({
      ...DEFAULT_HOOK,
      notes: [
        makeNote({ id: 'note-own', author_user: 'user-1', body: 'Mi nota' }),
        makeNote({ id: 'note-other', author_user: 'user-2', body: 'Nota ajena' }),
      ],
    })
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    // Hay 1 botón borrar — solo para la propia nota
    const deleteButtons = screen.getAllByRole('button', { name: /eliminar nota/i })
    expect(deleteButtons).toHaveLength(1)
  })

  it('click en "Borrar" llama a deleteNote con el id correcto', async () => {
    const deleteNote = vi.fn()
    mockUseConversationNotes.mockReturnValue({
      ...DEFAULT_HOOK,
      notes: [makeNote({ id: 'note-to-delete', author_user: 'user-1', body: 'Mi nota' })],
      deleteNote,
    })
    const user = userEvent.setup()
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    await user.click(screen.getByRole('button', { name: /eliminar nota/i }))
    expect(deleteNote).toHaveBeenCalledWith('note-to-delete')
  })

  it('submit del form con texto llama a addNote', async () => {
    const addNote = vi.fn()
    mockUseConversationNotes.mockReturnValue({ ...DEFAULT_HOOK, addNote })
    const user = userEvent.setup()
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    await user.type(screen.getByRole('textbox', { name: /escribir nota/i }), 'Nota de prueba')
    await user.click(screen.getByRole('button', { name: /agregar nota/i }))
    expect(addNote).toHaveBeenCalledWith('Nota de prueba', expect.any(Object))
  })

  it('botón "Agregar nota" deshabilitado cuando el textarea está vacío', () => {
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    const btn = screen.getByRole('button', { name: /agregar nota/i })
    expect(btn).toBeDisabled()
  })

  it('muestra contador de caracteres restantes', () => {
    render(<ConversationNotes phone="+5491111111111" currentUserId="user-1" />)
    expect(screen.getByText(/2000 caracteres restantes/i)).toBeInTheDocument()
  })
})
